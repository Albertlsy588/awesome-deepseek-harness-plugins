import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it, vi } from 'vitest'
import {
  hydrateCuratedRepositories,
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

/** The migrated production shape: a repository, and the plugins it publishes. */
function catalogDatabase(): DatabaseSync {
  const database = new DatabaseSync(':memory:')
  for (const migration of ['0002_plugin_catalog.sql', '0005_catalog_plugins.sql',
    '0006_ai_classification.sql']) {
    database.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'))
  }
  return database
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

const NOW = '2026-08-16T00:00:00.000Z'

function seedRepository(
  database: DatabaseSync,
  overrides: Record<string, string | number | null> = {},
): void {
  const row = {
    github_id: 42 as number | null,
    full_name: 'Scan/Repo',
    normalized_full_name: 'scan/repo',
    owner: 'Scan',
    repository_name: 'Repo',
    from_topic: 1,
    ...overrides,
  }
  database.prepare(`
    INSERT INTO catalog_repositories (github_id, full_name, normalized_full_name, owner,
      repository_name, html_url, from_topic, first_seen_at, last_seen_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(row.github_id, row.full_name, row.normalized_full_name, row.owner, row.repository_name,
    `https://github.com/${row.full_name}`, row.from_topic, NOW, NOW, NOW, NOW)
}

/** Adds a plugin to the most recently seeded repository. */
function seedPlugin(
  database: DatabaseSync,
  repositoryFullName: string,
  overrides: Record<string, string | number | null> = {},
): void {
  const id = database.prepare('SELECT id, full_name FROM catalog_repositories WHERE normalized_full_name = ?')
    .get(repositoryFullName.toLowerCase()) as { id: number; full_name: string }
  const row = {
    plugin_path: '',
    validation_status: 'pending',
    manifest_path: null as string | null,
    ...overrides,
  }
  const pluginId = row.plugin_path === ''
    ? id.full_name
    : `${id.full_name}/${row.plugin_path}`
  database.prepare(`
    INSERT INTO catalog_plugins (repository_id, plugin_id, normalized_plugin_id, plugin_path,
      manifest_path, validation_status, first_seen_at, last_seen_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id.id, pluginId, pluginId.toLowerCase(), row.plugin_path, row.manifest_path,
    row.validation_status, NOW, NOW, NOW, NOW)
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
              // Nothing left to inspect, so the repository is unchanged.
              needs_validation: 0,
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

    const result = await upsertDiscoveredRepositories(db, [repository()], 'run-1', NOW)

    expect(result.changedCount).toBe(0)
    expect(calls[0]?.params).toEqual([42, 'owner/plugin'])
    expect(calls.some((call) => call.sql.includes('UPDATE catalog_repositories'))).toBe(true)
    // Provenance is a column now, so no source table is written.
    expect(calls.some((call) => call.sql.includes('catalog_repository_sources'))).toBe(false)
  })

  // Real SQLite, not the mock above: the identity-merge branch rewrites plugin
  // rows and its SQL has to match the migrated schema.
  it('merges a renamed repository onto the curated row and rebuilds its plugin ids', async () => {
    const database = catalogDatabase()
    // The topic scan discovered Owner/old-name; a submission has since created a
    // separate row for the post-rename Owner/new-name.
    seedRepository(database, {
      github_id: 42, full_name: 'Owner/old-name', normalized_full_name: 'owner/old-name',
      owner: 'Owner', repository_name: 'old-name',
    })
    seedRepository(database, {
      github_id: null, full_name: 'Owner/new-name', normalized_full_name: 'owner/new-name',
      owner: 'Owner', repository_name: 'new-name', from_topic: 0,
    })
    seedPlugin(database, 'owner/old-name', { plugin_path: 'packages/foo' })
    seedPlugin(database, 'owner/old-name', { plugin_path: 'packages/bar' })

    await upsertDiscoveredRepositories(
      sqliteD1(database),
      [{ ...repository(), full_name: 'Owner/new-name', name: 'new-name' }],
      'run-1',
      NOW,
    )

    expect(database.prepare(
      'SELECT normalized_full_name FROM catalog_repositories ORDER BY normalized_full_name',
    ).all()).toEqual([{ normalized_full_name: 'owner/new-name' }])
    // The plugins moved over with ids rebuilt around the surviving name.
    expect(database.prepare(
      `SELECT plugin_id FROM catalog_plugins WHERE plugin_path <> '' ORDER BY plugin_path`,
    ).all()).toEqual([
      { plugin_id: 'Owner/new-name/packages/bar' },
      { plugin_id: 'Owner/new-name/packages/foo' },
    ])
    database.close()
  })
})

describe('curated catalog reconciliation', () => {
  it('writes the repository and the plugin for every entry', async () => {
    const database = catalogDatabase()

    const result = await syncCuratedEntries(sqliteD1(database), [curatedEntry()], NOW)

    expect(result).toEqual({ total: 1, removedSources: 0 })
    expect(database.prepare(
      'SELECT full_name, normalized_full_name, owner, repository_name, html_url FROM catalog_repositories',
    ).all()).toEqual([{
      full_name: 'Owner/curated-plugin',
      normalized_full_name: 'owner/curated-plugin',
      owner: 'Owner',
      repository_name: 'curated-plugin',
      html_url: 'https://github.com/Owner/curated-plugin',
    }])
    expect(database.prepare(`
      SELECT plugin_id, plugin_path, from_pr, curated_name, curated_category,
             curated_description_en, curated_description_zh, curated_added
        FROM catalog_plugins
    `).all()).toEqual([{
      plugin_id: 'Owner/curated-plugin',
      plugin_path: '',
      from_pr: 1,
      curated_name: 'curated-plugin',
      curated_category: 'tools',
      curated_description_en: 'English',
      curated_description_zh: '中文',
      curated_added: '2026-08-15',
    }])
    database.close()
  })

  it('stores several subpackage plugins of one repository against a single repository row', async () => {
    const database = catalogDatabase()

    const result = await syncCuratedEntries(sqliteD1(database), [
      curatedEntry({ id: 'Owner/monorepo/packages/foo', name: 'foo', repository: 'https://github.com/Owner/monorepo' }),
      curatedEntry({ id: 'Owner/monorepo/packages/bar', name: 'bar', repository: 'https://github.com/Owner/monorepo' }),
    ], NOW)

    expect(result).toEqual({ total: 2, removedSources: 0 })
    expect(database.prepare('SELECT COUNT(*) AS count FROM catalog_repositories').get())
      .toEqual({ count: 1 })
    expect(database.prepare(
      'SELECT plugin_path, plugin_id, curated_name FROM catalog_plugins ORDER BY plugin_path',
    ).all()).toEqual([
      { plugin_path: 'packages/bar', plugin_id: 'Owner/monorepo/packages/bar', curated_name: 'bar' },
      { plugin_path: 'packages/foo', plugin_id: 'Owner/monorepo/packages/foo', curated_name: 'foo' },
    ])
    database.close()
  })

  it('reconciles a dropped subpackage without evicting its surviving sibling', async () => {
    const database = catalogDatabase()
    const db = sqliteD1(database)
    const foo = curatedEntry({ id: 'Owner/monorepo/packages/foo', name: 'foo', repository: 'https://github.com/Owner/monorepo' })
    const bar = curatedEntry({ id: 'Owner/monorepo/packages/bar', name: 'bar', repository: 'https://github.com/Owner/monorepo' })

    await syncCuratedEntries(db, [foo, bar], NOW)
    await syncCuratedEntries(db, [foo], '2026-08-16T02:00:00.000Z')

    expect(database.prepare('SELECT plugin_id FROM catalog_plugins').all())
      .toEqual([{ plugin_id: 'Owner/monorepo/packages/foo' }])
    database.close()
  })

  it('re-cases a plugin path without tripping the case-insensitive id index', async () => {
    const database = catalogDatabase()
    const db = sqliteD1(database)

    await syncCuratedEntries(db, [curatedEntry({
      id: 'Owner/monorepo/packages/DshUi', name: 'DshUi', repository: 'https://github.com/Owner/monorepo',
    })], NOW)
    // Correcting the path's case keeps the same normalized id, so the stale row
    // has to go before the new one lands.
    await syncCuratedEntries(db, [curatedEntry({
      id: 'Owner/monorepo/packages/dsh-ui', name: 'dsh-ui', repository: 'https://github.com/Owner/monorepo',
    })], '2026-08-16T02:00:00.000Z')

    expect(database.prepare('SELECT plugin_path, plugin_id FROM catalog_plugins').all())
      .toEqual([{ plugin_path: 'packages/dsh-ui', plugin_id: 'Owner/monorepo/packages/dsh-ui' }])
    database.close()
  })

  it('is idempotent and applies curated updates without a revision gate', async () => {
    const database = catalogDatabase()
    const db = sqliteD1(database)

    await syncCuratedEntries(db, [curatedEntry()], NOW)
    const updated = await syncCuratedEntries(db, [
      curatedEntry({ category: 'dev', description: { en: 'Updated', zh: '更新' } }),
    ], '2026-08-16T02:00:00.000Z')

    expect(updated).toEqual({ total: 1, removedSources: 0 })
    expect(database.prepare('SELECT COUNT(*) AS count FROM catalog_repositories').get())
      .toEqual({ count: 1 })
    expect(database.prepare('SELECT curated_category, curated_description_en FROM catalog_plugins').get())
      .toEqual({ curated_category: 'dev', curated_description_en: 'Updated' })
    database.close()
  })

  it('retires a curated plugin without deleting one the topic scan also found', async () => {
    const database = catalogDatabase()
    const db = sqliteD1(database)
    // Discovered and accepted, then also curated.
    seedRepository(database, {
      github_id: 99, full_name: 'Owner/both', normalized_full_name: 'owner/both',
      owner: 'Owner', repository_name: 'both',
    })
    seedPlugin(database, 'owner/both', { validation_status: 'accepted' })
    await syncCuratedEntries(db, [
      curatedEntry({ id: 'Owner/both', name: 'both', repository: 'https://github.com/Owner/both' }),
      curatedEntry(),
    ], NOW)

    // Dropping both submissions leaves the accepted plugin in place, stripped of
    // its curated columns; the never-validated one goes away entirely.
    const result = await syncCuratedEntries(db, [], '2026-08-16T02:00:00.000Z')

    expect(result.total).toBe(0)
    expect(database.prepare(
      'SELECT plugin_id, from_pr, curated_name, validation_status FROM catalog_plugins',
    ).all()).toEqual([
      { plugin_id: 'Owner/both', from_pr: 0, curated_name: null, validation_status: 'accepted' },
    ])
    // Repository rows are never deleted: production data is preserved.
    expect(database.prepare('SELECT COUNT(*) AS count FROM catalog_repositories').get())
      .toEqual({ count: 2 })
    database.close()
  })
})

describe('catalog snapshot', () => {
  it('publishes curated plugins and accepted discoveries alike', async () => {
    const database = catalogDatabase()
    seedRepository(database, {
      github_id: 7, full_name: 'Scan/Nested', normalized_full_name: 'scan/nested', repository_name: 'Nested',
    })
    seedPlugin(database, 'scan/nested', {
      plugin_path: 'packages/deep', manifest_path: 'packages/deep/package.json', validation_status: 'accepted',
    })
    seedRepository(database, {
      github_id: 8, full_name: 'Scan/Rejected', normalized_full_name: 'scan/rejected', repository_name: 'Rejected',
    })
    seedPlugin(database, 'scan/rejected', { validation_status: 'rejected' })
    await syncCuratedEntries(sqliteD1(database), [
      curatedEntry({ id: 'Owner/mono/packages/foo', name: 'foo', repository: 'https://github.com/Owner/mono' }),
    ], NOW)

    const snapshot = await loadCatalogSnapshotFromD1(sqliteD1(database), NOW)

    // The rejected discovery is absent; the nested one installs from its own
    // directory instead of a repository root that has no bundle.
    expect(snapshot?.plugins.map((plugin) => plugin.id).sort()).toEqual([
      'Owner/mono/packages/foo',
      'Scan/Nested/packages/deep',
    ])
    expect(snapshot?.plugins.map((plugin) => plugin.install).sort()).toEqual([
      'dsh plugin --profile web add github:Owner/mono#path:packages/foo',
      'dsh plugin --profile web add github:Scan/Nested#path:packages/deep',
    ])
    database.close()
  })

  it('prefers curated copy over the GitHub blurb', async () => {
    const database = catalogDatabase()
    seedRepository(database, {
      github_id: 11, full_name: 'Owner/both', normalized_full_name: 'owner/both', repository_name: 'both',
    })
    seedPlugin(database, 'owner/both', { validation_status: 'accepted' })
    database.prepare("UPDATE catalog_repositories SET github_description = ? WHERE normalized_full_name = 'owner/both'")
      .run('GitHub blurb')
    await syncCuratedEntries(sqliteD1(database), [
      curatedEntry({ id: 'Owner/both', name: '人工命名', repository: 'https://github.com/Owner/both' }),
    ], NOW)

    const snapshot = await loadCatalogSnapshotFromD1(sqliteD1(database), NOW)

    expect(snapshot?.plugins[0]).toMatchObject({
      name: '人工命名',
      description: { en: 'English', zh: '中文' },
    })
    database.close()
  })

  it('falls back to the GitHub blurb when nobody curated the plugin', async () => {
    const database = catalogDatabase()
    seedRepository(database, { github_id: 12 })
    seedPlugin(database, 'scan/repo', { validation_status: 'accepted' })
    database.prepare("UPDATE catalog_repositories SET github_description = ? WHERE normalized_full_name = 'scan/repo'")
      .run('GitHub blurb')

    const snapshot = await loadCatalogSnapshotFromD1(sqliteD1(database), NOW)

    expect(snapshot?.plugins[0]).toMatchObject({
      id: 'Scan/Repo',
      name: 'Repo',
      category: 'unclassified',
      description: { en: 'GitHub blurb', zh: 'GitHub blurb' },
      install: 'dsh plugin --profile web add github:Scan/Repo',
    })
    database.close()
  })
})

describe('curated repository hydration', () => {
  function githubClient(repositories: Record<string, unknown>) {
    return {
      async request<T>(path: string): Promise<T> {
        const key = path.replace('/repos/', '')
        const found = repositories[key]
        if (!found) throw new Error(`404 ${path}`)
        return found as T
      },
    }
  }

  const payload = (id: number, fullName: string) => ({
    id,
    name: fullName.split('/')[1],
    full_name: fullName,
    html_url: `https://github.com/${fullName}`,
    description: 'from github',
    default_branch: 'main',
    stargazers_count: 5,
    forks_count: 1,
    language: 'TypeScript',
    license: { spdx_id: 'MIT' },
    updated_at: NOW,
    pushed_at: NOW,
  })

  it('fills in the GitHub facts a submission could not supply', async () => {
    const database = catalogDatabase()
    await syncCuratedEntries(sqliteD1(database), [curatedEntry()], NOW)

    const hydrated = await hydrateCuratedRepositories(
      sqliteD1(database),
      githubClient({ 'Owner/curated-plugin': payload(500, 'Owner/curated-plugin') }),
      10,
      NOW,
    )

    expect(hydrated).toBe(1)
    expect(database.prepare('SELECT github_id, stars FROM catalog_repositories').get())
      .toEqual({ github_id: 500, stars: 5 })
    database.close()
  })

  // GitHub redirects a renamed repository to its current name, so the id we
  // fetch can already belong to the row the topic scan created under that new
  // name. Failing on UNIQUE(github_id) would stall the queue forever.
  it('merges onto the existing row when the id is already taken', async () => {
    const database = catalogDatabase()
    seedRepository(database, {
      github_id: 900, full_name: 'Owner/new-name', normalized_full_name: 'owner/new-name',
      owner: 'Owner', repository_name: 'new-name',
    })
    seedPlugin(database, 'owner/new-name', { validation_status: 'accepted' })
    await syncCuratedEntries(sqliteD1(database), [curatedEntry({
      id: 'Owner/old-name', name: 'old-name', repository: 'https://github.com/Owner/old-name',
    })], NOW)

    const hydrated = await hydrateCuratedRepositories(
      sqliteD1(database),
      // The old name redirects to the new one, which already has id 900.
      githubClient({ 'Owner/old-name': payload(900, 'Owner/new-name') }),
      10,
      NOW,
    )

    expect(hydrated).toBe(1)
    // One repository survives, carrying both the discovery and the curation.
    expect(database.prepare('SELECT full_name, github_id FROM catalog_repositories').all())
      .toEqual([{ full_name: 'Owner/new-name', github_id: 900 }])
    expect(database.prepare(
      'SELECT plugin_id, from_pr, curated_name, validation_status FROM catalog_plugins',
    ).all()).toEqual([
      {
        plugin_id: 'Owner/new-name',
        from_pr: 1,
        curated_name: 'old-name',
        validation_status: 'accepted',
      },
    ])
    database.close()
  })
})
