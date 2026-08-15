import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it, vi } from 'vitest'
import {
  normalizeRepositoryName,
  syncBundledRegistry,
  upsertDiscoveredRepositories,
} from '../worker/lib/catalog-db'
import type { Registry } from '../worker/types'
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

  it('reruns a legacy bundled sync when repository identity projection changes', async () => {
    const database = new DatabaseSync(':memory:')
    database.exec(readFileSync(
      new URL('../migrations/0002_plugin_catalog.sql', import.meta.url),
      'utf8',
    ))
    const revision = `sha256:${'1'.repeat(64)}`
    const now = '2026-08-15T00:00:00.000Z'
    database.exec(`
      INSERT INTO catalog_repositories (
        github_id, full_name, normalized_full_name, owner, repository_name, html_url,
        validation_status, topic_present, first_seen_at, last_seen_at, created_at, updated_at
      ) VALUES
        (NULL, 'Owner/Display Name', 'owner/display name', 'Owner', 'Display Name',
         'https://github.com/Owner/canonical-plugin', 'pending', 0,
         '${now}', '${now}', '${now}', '${now}'),
        (42, 'Owner/canonical-plugin', 'owner/canonical-plugin', 'Owner', 'canonical-plugin',
         'https://github.com/Owner/canonical-plugin', 'accepted', 1,
         '${now}', '${now}', '${now}', '${now}');
      INSERT INTO catalog_repository_sources (
        repository_id, source, source_reference, first_seen_at, last_seen_at
      ) VALUES
        (1, 'github_pr', 'https://github.com/Owner/canonical-plugin', '${now}', '${now}'),
        (2, 'github_topic', 'deepseek-harness-plugin', '${now}', '${now}');
      INSERT INTO catalog_metadata (
        repository_id, display_name, category, description_en, description_zh,
        added, source, updated_at
      ) VALUES (1, 'Display Name', 'tool', 'English', '中文', '2026-08-15', 'github_pr', '${now}');
      INSERT INTO catalog_state (key, value, updated_at)
      VALUES ('bundled_registry_revision', '${revision}', '${now}');
    `)
    const registry: Registry = {
      updated: now,
      count: 1,
      revision,
      categories: { tool: { en: 'Tool', zh: '工具' } },
      plugins: [{
        name: 'Display Name',
        owner: 'Owner',
        url: 'https://github.com/Owner/canonical-plugin',
        category: 'tool',
        description: { en: 'English', zh: '中文' },
        install: 'dsh plugin add Owner/canonical-plugin',
        added: '2026-08-15',
      }],
    }

    await syncBundledRegistry(sqliteD1(database), registry, '2026-08-15T01:00:00.000Z')

    expect(database.prepare(
      "SELECT value FROM catalog_state WHERE key = 'bundled_registry_revision'",
    ).get()).toEqual({ value: `repository-url-v2:${revision}` })
    expect(database.prepare(`
      SELECT m.display_name
      FROM catalog_metadata m
      JOIN catalog_repositories r ON r.id = m.repository_id
      WHERE r.normalized_full_name = 'owner/canonical-plugin'
    `).get()).toEqual({ display_name: 'Display Name' })
    expect(database.prepare(`
      SELECT source
      FROM catalog_repository_sources s
      JOIN catalog_repositories r ON r.id = s.repository_id
      WHERE r.normalized_full_name = 'owner/canonical-plugin'
      ORDER BY source
    `).all()).toEqual([{ source: 'github_pr' }, { source: 'github_topic' }])
    expect(database.prepare(`
      SELECT COUNT(*) AS count
      FROM catalog_metadata m
      JOIN catalog_repositories r ON r.id = m.repository_id
      WHERE r.normalized_full_name = 'owner/display name'
    `).get()).toEqual({ count: 0 })
    expect(database.prepare(`
      SELECT COUNT(*) AS count
      FROM catalog_repository_sources s
      JOIN catalog_repositories r ON r.id = s.repository_id
      WHERE r.normalized_full_name = 'owner/display name' AND s.source = 'github_pr'
    `).get()).toEqual({ count: 0 })
    database.close()
  })
})
