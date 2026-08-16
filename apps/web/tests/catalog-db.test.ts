import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it, vi } from 'vitest'
import {
  loadCatalogSnapshotFromD1,
  normalizeRepositoryName,
  syncCuratedEntries,
  upsertDiscoveredRepositories,
  type CuratedCatalogEntry,
} from '../worker/lib/catalog-db'
import type { GitHubRepository } from '../worker/lib/github-discovery'

class SqliteD1Statement {
  constructor(
    private readonly database: DatabaseSync,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]) {
    return new SqliteD1Statement(this.database, this.sql, params)
  }

  async all<T>() {
    return { results: this.database.prepare(this.sql).all(...this.params) as T[] }
  }

  async first<T>() {
    return (this.database.prepare(this.sql).get(...this.params) as T | undefined) ?? null
  }

  async run() {
    const result = this.database.prepare(this.sql).run(...this.params)
    return { success: true, meta: { changes: Number(result.changes) } }
  }
}

function sqliteD1(database: DatabaseSync): D1Database {
  return {
    prepare(sql: string) {
      return new SqliteD1Statement(database, sql)
    },
    async batch(statements: SqliteD1Statement[]) {
      const results = []
      for (const statement of statements) results.push(await statement.run())
      return results
    },
  } as unknown as D1Database
}

function repository(): GitHubRepository {
  return {
    id: 42,
    name: 'Plugin',
    full_name: 'Owner/Plugin',
    html_url: 'https://github.com/Owner/Plugin',
    description: null,
    fork: false,
    archived: false,
    disabled: false,
    default_branch: 'main',
    stargazers_count: 3,
    forks_count: 1,
    language: 'TypeScript',
    license: { spdx_id: 'MIT' },
    updated_at: '2026-08-14T12:00:00Z',
    pushed_at: '2026-08-14T11:00:00Z',
  }
}

describe('D1 catalog deduplication', () => {
  it('normalizes repository names independently of GitHub casing', () => {
    expect(normalizeRepositoryName(' Owner/Plugin ')).toBe('owner/plugin')
  })

  it('does not revalidate an unchanged repository found by numeric GitHub ID', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = []
    const prepare = vi.fn((sql: string) => {
      const call = { sql, params: [] as unknown[] }
      calls.push(call)
      const statement = {
        bind(...params: unknown[]) {
          call.params = params
          return statement
        },
        async all() {
          return {
            results: [{
              id: 7,
              github_id: 42,
              normalized_full_name: 'owner/plugin',
              default_branch: 'main',
              pushed_at: '2026-08-14T11:00:00Z',
              validation_status: 'accepted',
            }],
          }
        },
        async run() {
          return { success: true }
        },
      }
      return statement
    })
    const db = { prepare, batch: vi.fn(async () => []) } as unknown as D1Database

    const result = await upsertDiscoveredRepositories(
      db,
      [repository()],
      'run-1',
      '2026-08-14T12:30:00Z',
    )

    expect(result.changedCount).toBe(0)
    expect(calls).toHaveLength(3)
    expect(calls[0]?.params).toEqual([42, 'owner/plugin'])
    expect(calls[1]?.sql).toContain('UPDATE catalog_repositories')
    expect(calls[2]?.sql).toContain('catalog_repository_sources')
  })

  // Runs against real SQLite (not the mock above), because the identity-merge
  // branch writes catalog_metadata and its SQL must match the migrated schema.
  it('merges a renamed repository onto the curated row and rebuilds its plugin ids', async () => {
    const database = catalogDatabase()
    const now = '2026-08-16T00:00:00.000Z'
    // The topic scan discovered Owner/old-name; a curated submission has since
    // created a separate row for the post-rename Owner/new-name, carrying two
    // subpackage plugins.
    database.exec(`
      INSERT INTO catalog_repositories (
        github_id, full_name, normalized_full_name, owner, repository_name, html_url,
        validation_status, topic_present, first_seen_at, last_seen_at, created_at, updated_at
      ) VALUES
        (42, 'Owner/old-name', 'owner/old-name', 'Owner', 'old-name',
         'https://github.com/Owner/old-name', 'accepted', 1, '${now}', '${now}', '${now}', '${now}'),
        (NULL, 'Owner/new-name', 'owner/new-name', 'Owner', 'new-name',
         'https://github.com/Owner/new-name', 'pending', 0, '${now}', '${now}', '${now}', '${now}');
      INSERT INTO catalog_repository_sources (
        repository_id, source, source_reference, first_seen_at, last_seen_at
      ) VALUES (1, 'github_topic', 'dsh-plugin', '${now}', '${now}');
      INSERT INTO catalog_metadata (
        repository_id, plugin_path, plugin_id, normalized_plugin_id,
        display_name, category, description_en, description_zh, added, source, updated_at
      ) VALUES
        (1, 'packages/foo', 'Owner/old-name/packages/foo', 'owner/old-name/packages/foo',
         'foo', 'tools', 'English', '中文', '2026-08-15', 'github_pr', '${now}'),
        (1, 'packages/bar', 'Owner/old-name/packages/bar', 'owner/old-name/packages/bar',
         'bar', 'tools', 'English', '中文', '2026-08-15', 'github_pr', '${now}');
    `)

    await upsertDiscoveredRepositories(
      sqliteD1(database),
      [{ ...repository(), full_name: 'Owner/new-name', name: 'new-name' }],
      'run-1',
      now,
    )

    // The stale row is gone and its plugins moved over with ids rebuilt around
    // the new repository name.
    expect(database.prepare(
      'SELECT normalized_full_name FROM catalog_repositories ORDER BY normalized_full_name',
    ).all()).toEqual([{ normalized_full_name: 'owner/new-name' }])
    expect(database.prepare(
      'SELECT plugin_id, normalized_plugin_id FROM catalog_metadata ORDER BY plugin_path',
    ).all()).toEqual([
      {
        plugin_id: 'Owner/new-name/packages/bar',
        normalized_plugin_id: 'owner/new-name/packages/bar',
      },
      {
        plugin_id: 'Owner/new-name/packages/foo',
        normalized_plugin_id: 'owner/new-name/packages/foo',
      },
    ])
    database.close()
  })
})

function catalogDatabase(): DatabaseSync {
  const database = new DatabaseSync(':memory:')
  // Applied in order, so the tests run against the migrated production shape
  // rather than the original one.
  for (const migration of [
    '0002_plugin_catalog.sql',
    '0005_catalog_plugin_paths.sql',
    '0006_plugin_install_methods.sql',
  ]) {
    database.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'))
  }
  return database
}

function curatedEntry(overrides: Partial<CuratedCatalogEntry> = {}): CuratedCatalogEntry {
  return {
    id: 'Owner/curated-plugin',
    name: 'curated-plugin',
    repository: 'https://github.com/Owner/curated-plugin',
    category: 'tools',
    description: { en: 'English', zh: '中文' },
    added: '2026-08-15',
    ...overrides,
  }
}

describe('curated catalog reconciliation', () => {
  it('upserts repositories, github_pr sources, and metadata for every entry', async () => {
    const database = catalogDatabase()
    const now = '2026-08-15T01:00:00.000Z'

    const result = await syncCuratedEntries(sqliteD1(database), [curatedEntry()], now)

    expect(result).toEqual({ total: 1, removedSources: 0 })
    expect(database.prepare(`
      SELECT full_name, normalized_full_name, owner, repository_name, html_url, validation_status
      FROM catalog_repositories
    `).all()).toEqual([{
      full_name: 'Owner/curated-plugin',
      normalized_full_name: 'owner/curated-plugin',
      owner: 'Owner',
      repository_name: 'curated-plugin',
      html_url: 'https://github.com/Owner/curated-plugin',
      validation_status: 'pending',
    }])
    expect(database.prepare(`
      SELECT source, source_reference FROM catalog_repository_sources
    `).all()).toEqual([{
      source: 'github_pr',
      source_reference: 'https://github.com/Owner/curated-plugin',
    }])
    expect(database.prepare(`
      SELECT display_name, category, description_en, description_zh, added, source
      FROM catalog_metadata
    `).all()).toEqual([{
      display_name: 'curated-plugin',
      category: 'tools',
      description_en: 'English',
      description_zh: '中文',
      added: '2026-08-15',
      source: 'github_pr',
    }])
    database.close()
  })

  it('stores several subpackage plugins of one repository against a single repository row', async () => {
    const database = catalogDatabase()
    const now = '2026-08-15T01:00:00.000Z'

    const result = await syncCuratedEntries(sqliteD1(database), [
      curatedEntry({
        id: 'Owner/monorepo/packages/foo',
        name: 'foo',
        repository: 'https://github.com/Owner/monorepo',
      }),
      curatedEntry({
        id: 'Owner/monorepo/packages/bar',
        name: 'bar',
        repository: 'https://github.com/Owner/monorepo',
      }),
    ], now)

    expect(result).toEqual({ total: 2, removedSources: 0 })
    expect(database.prepare('SELECT COUNT(*) AS count FROM catalog_repositories').get())
      .toEqual({ count: 1 })
    expect(database.prepare('SELECT COUNT(*) AS count FROM catalog_repository_sources').get())
      .toEqual({ count: 1 })
    expect(database.prepare(`
      SELECT plugin_path, plugin_id, normalized_plugin_id, display_name
      FROM catalog_metadata ORDER BY plugin_path
    `).all()).toEqual([
      {
        plugin_path: 'packages/bar',
        plugin_id: 'Owner/monorepo/packages/bar',
        normalized_plugin_id: 'owner/monorepo/packages/bar',
        display_name: 'bar',
      },
      {
        plugin_path: 'packages/foo',
        plugin_id: 'Owner/monorepo/packages/foo',
        normalized_plugin_id: 'owner/monorepo/packages/foo',
        display_name: 'foo',
      },
    ])
    database.close()
  })

  it('reconciles a dropped subpackage without evicting its surviving sibling', async () => {
    const database = catalogDatabase()
    const db = sqliteD1(database)
    const foo = curatedEntry({
      id: 'Owner/monorepo/packages/foo',
      name: 'foo',
      repository: 'https://github.com/Owner/monorepo',
    })
    const bar = curatedEntry({
      id: 'Owner/monorepo/packages/bar',
      name: 'bar',
      repository: 'https://github.com/Owner/monorepo',
    })

    await syncCuratedEntries(db, [foo, bar], '2026-08-15T01:00:00.000Z')
    const result = await syncCuratedEntries(db, [foo], '2026-08-15T02:00:00.000Z')

    // The repository keeps its github_pr source because one plugin survives.
    expect(result).toEqual({ total: 1, removedSources: 0 })
    expect(database.prepare('SELECT plugin_id FROM catalog_metadata').all())
      .toEqual([{ plugin_id: 'Owner/monorepo/packages/foo' }])
    expect(database.prepare('SELECT COUNT(*) AS count FROM catalog_repository_sources').get())
      .toEqual({ count: 1 })

    // Dropping the last plugin of the repository retires its curation marker.
    const emptied = await syncCuratedEntries(db, [curatedEntry()], '2026-08-15T03:00:00.000Z')
    expect(emptied.removedSources).toBe(1)
    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM catalog_metadata
       WHERE normalized_plugin_id LIKE 'owner/monorepo%'
    `).get()).toEqual({ count: 0 })
    database.close()
  })

  it('re-cases a plugin path without tripping the case-insensitive id index', async () => {
    const database = catalogDatabase()
    const db = sqliteD1(database)

    await syncCuratedEntries(db, [curatedEntry({
      id: 'Owner/monorepo/packages/DshUi',
      name: 'DshUi',
      repository: 'https://github.com/Owner/monorepo',
    })], '2026-08-15T01:00:00.000Z')
    // Correcting the path's case keeps the same normalized id, so the stale row
    // has to go before the new one lands.
    await syncCuratedEntries(db, [curatedEntry({
      id: 'Owner/monorepo/packages/dsh-ui',
      name: 'dsh-ui',
      repository: 'https://github.com/Owner/monorepo',
    })], '2026-08-15T02:00:00.000Z')

    expect(database.prepare('SELECT plugin_path, plugin_id FROM catalog_metadata').all())
      .toEqual([{ plugin_path: 'packages/dsh-ui', plugin_id: 'Owner/monorepo/packages/dsh-ui' }])
    database.close()
  })

  it('is idempotent and applies metadata updates without a revision gate', async () => {
    const database = catalogDatabase()
    const db = sqliteD1(database)

    await syncCuratedEntries(db, [curatedEntry()], '2026-08-15T01:00:00.000Z')
    const updated = await syncCuratedEntries(db, [
      curatedEntry({ category: 'dev', description: { en: 'Updated', zh: '更新' } }),
    ], '2026-08-15T02:00:00.000Z')

    expect(updated).toEqual({ total: 1, removedSources: 0 })
    expect(database.prepare('SELECT COUNT(*) AS count FROM catalog_repositories').get())
      .toEqual({ count: 1 })
    expect(database.prepare('SELECT category, description_en FROM catalog_metadata').get())
      .toEqual({ category: 'dev', description_en: 'Updated' })
    database.close()
  })

  it('removes only the github_pr source and metadata for entries missing from the payload', async () => {
    const database = catalogDatabase()
    const now = '2026-08-15T00:00:00.000Z'
    database.exec(`
      INSERT INTO catalog_repositories (
        github_id, full_name, normalized_full_name, owner, repository_name, html_url,
        validation_status, topic_present, first_seen_at, last_seen_at, created_at, updated_at
      ) VALUES
        (NULL, 'Owner/retired-plugin', 'owner/retired-plugin', 'Owner', 'retired-plugin',
         'https://github.com/Owner/retired-plugin', 'pending', 0,
         '${now}', '${now}', '${now}', '${now}'),
        (42, 'Owner/scanned-plugin', 'owner/scanned-plugin', 'Owner', 'scanned-plugin',
         'https://github.com/Owner/scanned-plugin', 'accepted', 1,
         '${now}', '${now}', '${now}', '${now}');
      INSERT INTO catalog_repository_sources (
        repository_id, source, source_reference, first_seen_at, last_seen_at
      ) VALUES
        (1, 'github_pr', 'https://github.com/Owner/retired-plugin', '${now}', '${now}'),
        (1, 'github_topic', 'dsh-plugin', '${now}', '${now}'),
        (2, 'github_topic', 'dsh-plugin', '${now}', '${now}');
      INSERT INTO catalog_metadata (
        repository_id, plugin_path, plugin_id, normalized_plugin_id,
        display_name, category, description_en, description_zh,
        added, source, updated_at
      ) VALUES (1, '', 'Owner/retired-plugin', 'owner/retired-plugin',
        'retired-plugin', 'tools', 'English', '中文', '2026-08-15', 'github_pr', '${now}');
    `)

    const result = await syncCuratedEntries(
      sqliteD1(database),
      [curatedEntry()],
      '2026-08-15T01:00:00.000Z',
    )

    expect(result).toEqual({ total: 1, removedSources: 1 })
    // The repository rows survive: only the curation markers are reconciled away.
    expect(database.prepare(`
      SELECT normalized_full_name FROM catalog_repositories ORDER BY normalized_full_name
    `).all()).toEqual([
      { normalized_full_name: 'owner/curated-plugin' },
      { normalized_full_name: 'owner/retired-plugin' },
      { normalized_full_name: 'owner/scanned-plugin' },
    ])
    expect(database.prepare(`
      SELECT s.source
      FROM catalog_repository_sources s
      JOIN catalog_repositories r ON r.id = s.repository_id
      WHERE r.normalized_full_name = 'owner/retired-plugin'
      ORDER BY s.source
    `).all()).toEqual([{ source: 'github_topic' }])
    expect(database.prepare(`
      SELECT COUNT(*) AS count
      FROM catalog_metadata m
      JOIN catalog_repositories r ON r.id = m.repository_id
      WHERE r.normalized_full_name = 'owner/retired-plugin'
    `).get()).toEqual({ count: 0 })
    expect(database.prepare(`
      SELECT COUNT(*) AS count
      FROM catalog_repository_sources s
      JOIN catalog_repositories r ON r.id = s.repository_id
      WHERE r.normalized_full_name = 'owner/scanned-plugin'
    `).get()).toEqual({ count: 1 })
    database.close()
  })
})


describe('catalog snapshot identity', () => {
  const now = '2026-08-16T00:00:00.000Z'

  function seedRepository(database: DatabaseSync, overrides: Record<string, string | number | null> = {}): void {
    const row = {
      github_id: 900,
      full_name: 'Acme/Mono',
      normalized_full_name: 'acme/mono',
      owner: 'Acme',
      repository_name: 'Mono',
      html_url: 'https://github.com/Acme/Mono',
      package_path: 'packages/nested/package.json',
      ...overrides,
    }
    database.prepare(`
      INSERT INTO catalog_repositories (github_id, full_name, normalized_full_name, owner, repository_name,
        html_url, description, package_path, validation_status, topic_present,
        first_seen_at, last_seen_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'Discovered.', ?, 'accepted', 1, ?, ?, ?, ?)
    `).run(row.github_id, row.full_name, row.normalized_full_name, row.owner, row.repository_name,
      row.html_url, row.package_path, now, now, now, now)
    database.prepare(`
      INSERT INTO catalog_repository_sources (repository_id, source, source_reference, first_seen_at, last_seen_at)
      SELECT id, 'github_topic', 'dsh-plugin', ?, ? FROM catalog_repositories WHERE normalized_full_name = ?
    `).run(now, now, row.normalized_full_name)
  }

  // The topic scan accepts nested manifests, and the plugin id is derived from
  // that path. Without it the install spec points at the repository root, where
  // no bundle exists — the case that affects most auto-discovered monorepos.
  it('derives a discovered plugin id from the accepted manifest directory', async () => {
    const database = catalogDatabase()
    seedRepository(database)

    const snapshot = await loadCatalogSnapshotFromD1(sqliteD1(database), now)

    expect(snapshot?.plugins).toHaveLength(1)
    expect(snapshot?.plugins[0]).toMatchObject({
      id: 'Acme/Mono/packages/nested',
      repository: 'Mono',
      url: 'https://github.com/Acme/Mono',
      install: 'dsh plugin --profile web add github:Acme/Mono#path:packages/nested',
    })
    database.close()
  })

  it('keeps a root-manifest discovery at its repository id', async () => {
    const database = catalogDatabase()
    seedRepository(database, { package_path: 'package.json' })

    const snapshot = await loadCatalogSnapshotFromD1(sqliteD1(database), now)

    expect(snapshot?.plugins[0]).toMatchObject({
      id: 'Acme/Mono',
      install: 'dsh plugin --profile web add github:Acme/Mono',
    })
    database.close()
  })

  it('lets a repository contribute one plugin per curated entry', async () => {
    const database = catalogDatabase()
    const db = sqliteD1(database)
    seedRepository(database, { package_path: null })
    await syncCuratedEntries(db, [
      curatedEntry({ id: 'Acme/Mono/packages/foo', name: 'foo', repository: 'https://github.com/Acme/Mono' }),
      curatedEntry({ id: 'Acme/Mono/packages/bar', name: 'bar', repository: 'https://github.com/Acme/Mono' }),
    ], now)

    const snapshot = await loadCatalogSnapshotFromD1(db, now)

    // Curated metadata defines the repository's plugins; the topic scan only
    // contributes repository facts, so it adds no extra repository-level row.
    expect(snapshot?.plugins.map((plugin) => plugin.id).sort()).toEqual([
      'Acme/Mono/packages/bar',
      'Acme/Mono/packages/foo',
    ])
    expect(snapshot?.plugins.map((plugin) => plugin.install).sort()).toEqual([
      'dsh plugin --profile web add github:Acme/Mono#path:packages/bar',
      'dsh plugin --profile web add github:Acme/Mono#path:packages/foo',
    ])
    database.close()
  })
})


describe('published plugin set', () => {
  const now = '2026-08-16T00:00:00.000Z'

  function seedRepository(
    database: DatabaseSync,
    overrides: Record<string, string | number | null>,
  ): void {
    const row = {
      github_id: null as number | null,
      full_name: 'Acme/Repo',
      normalized_full_name: 'acme/repo',
      owner: 'Acme',
      repository_name: 'Repo',
      package_path: null as string | null,
      validation_status: 'accepted',
      topic_present: 1,
      ...overrides,
    }
    database.prepare(`
      INSERT INTO catalog_repositories (github_id, full_name, normalized_full_name, owner,
        repository_name, html_url, package_path, validation_status, topic_present,
        first_seen_at, last_seen_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(row.github_id, row.full_name, row.normalized_full_name, row.owner, row.repository_name,
      `https://github.com/${row.full_name}`, row.package_path, row.validation_status,
      row.topic_present, now, now, now, now)
  }

  // The set served to readers and the set fed to the validation queue used to be
  // two different predicates, and they disagreed: every curated plugin was
  // published without ever being inspected. One view now defines both.
  it('covers curated and topic-discovered plugins alike', async () => {
    const database = catalogDatabase()
    seedRepository(database, {
      full_name: 'Scan/Nested', normalized_full_name: 'scan/nested', repository_name: 'Nested',
      github_id: 7, package_path: 'packages/deep/package.json',
    })
    seedRepository(database, {
      full_name: 'Scan/Root', normalized_full_name: 'scan/root', repository_name: 'Root',
      github_id: 8, package_path: 'package.json',
    })
    // Not accepted and not curated: not published, so not queued either.
    seedRepository(database, {
      full_name: 'Scan/Rejected', normalized_full_name: 'scan/rejected', repository_name: 'Rejected',
      github_id: 9, package_path: 'package.json', validation_status: 'rejected',
    })
    await syncCuratedEntries(sqliteD1(database), [
      curatedEntry({ id: 'Acme/Mono/packages/foo', name: 'foo', repository: 'https://github.com/Acme/Mono' }),
      curatedEntry({ id: 'Acme/Mono/packages/bar', name: 'bar', repository: 'https://github.com/Acme/Mono' }),
    ], now)

    expect(database.prepare(
      'SELECT full_name, plugin_path FROM catalog_published_plugins ORDER BY full_name, plugin_path',
    ).all()).toEqual([
      // One row per curated plugin, so a monorepo contributes several.
      { full_name: 'Acme/Mono', plugin_path: 'packages/bar' },
      { full_name: 'Acme/Mono', plugin_path: 'packages/foo' },
      // A topic-only repository sits at its accepted manifest's directory.
      { full_name: 'Scan/Nested', plugin_path: 'packages/deep' },
      { full_name: 'Scan/Root', plugin_path: '' },
    ])
    database.close()
  })

  it('seeds the inspection queue from the same set', async () => {
    const database = catalogDatabase()
    // The migration's backfill only sees rows that existed when it ran, so a
    // repository added afterwards proves the view, not the backfill.
    seedRepository(database, { github_id: 11, package_path: 'package.json' })

    expect(database.prepare(`
      SELECT COUNT(*) AS pending FROM catalog_published_plugins p
       WHERE NOT EXISTS (
         SELECT 1 FROM catalog_plugin_manifests m
          WHERE m.repository_id = p.repository_id AND m.plugin_path = p.plugin_path
       )
    `).get()).toEqual({ pending: 1 })
    database.close()
  })
})
