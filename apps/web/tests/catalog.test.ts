import { describe, expect, it } from 'vitest'
import { edgeCacheablePath, notModifiedFor, weakEtag } from '../worker/lib/edge-cache'
import {
  buildCatalog,
  deriveCatalogResponse,
  findPlugin,
  parseCatalogQuery,
  repositoryName,
} from '../worker/lib/catalog'
import type { CatalogPlugin } from '../worker/types'
import { TEST_PLUGINS, TEST_REGISTRY, testCatalogResult } from './fixtures'

describe('catalog queries', () => {
  it('normalizes search text and invalid sort values', () => {
    expect(parseCatalogQuery({ q: '  terminal  ', sort: 'downloads' })).toEqual({
      q: 'terminal',
      category: '',
      sort: 'stars',
    })
    expect(parseCatalogQuery({ sort: 'growth7d' }).sort).toBe('growth7d')
    expect(parseCatalogQuery({ sort: 'installs24h' }).sort).toBe('installs24h')
  })

  it('searches localized descriptions, filters categories, and does not paginate', () => {
    const result = buildCatalog(testCatalogResult(), {
      q: '终端',
      category: 'tools',
      sort: 'newest',
    })

    expect(result.packages.map((plugin) => plugin.name)).toEqual(['dsh-bash-terminal'])
    expect(result.meta).toMatchObject({ total: 1, catalogTotal: TEST_PLUGINS.length })
    expect(result.categories).toHaveLength(7)
    expect(result.meta).not.toHaveProperty('page')
  })

  it('sorts all packages and builds stable ranking groups', () => {
    const result = buildCatalog(testCatalogResult(), { q: '', category: '', sort: 'name' })

    expect(result.packages).toHaveLength(TEST_PLUGINS.length)
    expect(result.packages[0]?.name).toBe('deepseek-harness-tui')
    expect(result.rankings.stars[0]?.name).toBe('dsh-crosstalk')
    expect(result.rankings.installs[0]?.name).toBe('dsh-crosstalk')
    expect(result.rankings.installs24h[0]?.name).toBe('dsh-agent-teams')
    expect(result.rankings.installs7d[0]?.name).toBe('dsh-agent-teams')
    expect(result.rankings.installs30d[0]?.name).toBe('dsh-crosstalk')
    expect(result.rankings.growth24h[0]?.name).toBe('dsh-agent-teams')
    expect(result.rankings.growth7d[0]?.name).toBe('dsh-agent-teams')
    expect(result.rankings.growth30d[0]?.name).toBe('dsh-crosstalk')
    expect(result.rankings.newest[0]?.name).toBe('dsh-agent-teams')
    expect(result.rankings.active[0]?.name).toBe('deepseek-harness-tui')
    // The fixture's two omdsh-dev/dsh-suite plugins share a repository, and
    // therefore share their stars, growth and pushed_at. The boards ranked by
    // those numbers seat the repository once; the install boards, ranked per
    // plugin, still seat both.
    const distinctRepositories = new Set(
      TEST_PLUGINS.map((plugin) => `${plugin.owner}/${plugin.repository}`.toLowerCase()),
    ).size
    expect(distinctRepositories).toBe(TEST_PLUGINS.length - 1)
    expect(result.rankings.stars).toHaveLength(distinctRepositories)
    expect(result.rankings.newest).toHaveLength(distinctRepositories)
    expect(result.rankings.active).toHaveLength(distinctRepositories)
    expect(result.rankings.growth24h).toHaveLength(distinctRepositories - 1)
    expect(result.rankings.installs).toHaveLength(TEST_PLUGINS.length - 1)
    expect(result.rankings.installs24h).toHaveLength(4)
  })

  it('keeps installation rankings empty while no tracked installs have arrived', () => {
    const base = testCatalogResult()
    const result = buildCatalog({
      ...base,
      snapshot: {
        ...base.snapshot,
        plugins: base.snapshot.plugins.map((plugin) => ({
          ...plugin,
          installCount: 0,
          installs24h: 0,
          installs7d: 0,
          installs30d: 0,
        })),
      },
    }, { q: '', category: '', sort: 'installs' })

    expect(result.packages).toHaveLength(TEST_PLUGINS.length)
    expect(result.rankings.installs).toEqual([])
    expect(result.rankings.installs24h).toEqual([])
    expect(result.rankings.installs7d).toEqual([])
    expect(result.rankings.installs30d).toEqual([])
  })

  it('sorts growth queries and excludes repositories without a complete baseline', () => {
    const result = buildCatalog(testCatalogResult(), {
      q: '',
      category: '',
      sort: 'growth24h',
    })

    expect(result.packages[0]?.name).toBe('dsh-agent-teams')
    expect(result.packages.map((plugin) => plugin.name)).not.toContain('dsh-bash-terminal')
  })

  it('derives any filtered view from the unfiltered response exactly like the server', () => {
    const snapshot = testCatalogResult()
    const full = buildCatalog(snapshot, { q: '', category: '', sort: 'stars' })
    const queries = [
      { q: '', category: 'tools', sort: 'stars' },
      { q: '终端', category: '', sort: 'newest' },
      { q: 'harness', category: '', sort: 'active' },
      { q: '', category: '', sort: 'growth24h' },
      { q: '', category: 'tools', sort: 'installs24h' },
    ] as const

    for (const query of queries) {
      const derived = deriveCatalogResponse(full, query)
      const direct = buildCatalog(snapshot, query)
      expect(derived.packages).toEqual(direct.packages)
      expect(derived.meta.total).toBe(direct.meta.total)
      expect(derived.rankings).toEqual(direct.rankings)
      expect(derived.categories).toEqual(direct.categories)
      expect(derived.meta.catalogTotal).toBe(direct.meta.catalogTotal)
    }
  })

  it('finds owners and repositories case-insensitively', () => {
    expect(findPlugin(TEST_REGISTRY.plugins, 'OPENMA-AI', 'deepseek-harness-tui')?.owner).toBe('openma-ai')
    expect(findPlugin(TEST_REGISTRY.plugins, 'openma-ai', 'DeepSeek-Harness-TUI')?.name).toBe('deepseek-harness-tui')
  })

  it('uses the repository URL for scoped package identifiers', () => {
    const scoped = {
      ...TEST_REGISTRY.plugins[0],
      name: '@scope/package-name',
      owner: 'example',
      url: 'https://github.com/example/repository-name',
    }
    expect(repositoryName(scoped)).toBe('repository-name')
    expect(findPlugin([scoped], 'example', 'repository-name')?.name).toBe('@scope/package-name')
  })
})

describe('ranking seats', () => {
  /** A monorepo: four plugins that share one repository, and one outsider. */
  function monorepoResult(overrides: Partial<CatalogPlugin> = {}) {
    const base = TEST_PLUGINS[0]
    const sibling = (path: string, extra: Partial<CatalogPlugin> = {}): CatalogPlugin => ({
      ...base,
      id: `mono/repo/packages/${path}`,
      name: path,
      owner: 'mono',
      repository: 'repo',
      url: 'https://github.com/mono/repo',
      // Every repository-level number is identical, which is the whole problem.
      stars: 3374,
      forks: 191,
      pushedAt: '2026-08-16T12:00:00Z',
      updatedAt: '2026-08-16T12:00:00Z',
      growth24h: 120,
      growth7d: 400,
      growth30d: 900,
      added: '2026-08-16',
      latestReleaseAt: null,
      installCount: 0,
      installs24h: 0,
      installs7d: 0,
      installs30d: 0,
      ...overrides,
      ...extra,
    })
    const outsider: CatalogPlugin = {
      ...base,
      id: 'solo/plugin',
      name: 'solo-plugin',
      owner: 'solo',
      repository: 'plugin',
      url: 'https://github.com/solo/plugin',
      stars: 10,
      forks: 1,
      pushedAt: '2026-08-15T12:00:00Z',
      updatedAt: '2026-08-15T12:00:00Z',
      growth24h: 5,
      growth7d: 5,
      growth30d: 5,
      added: '2026-08-15',
      latestReleaseAt: null,
      installCount: 0,
      installs24h: 0,
      installs7d: 0,
      installs30d: 0,
    }
    const result = testCatalogResult()
    return {
      ...result,
      snapshot: {
        ...result.snapshot,
        plugins: [sibling('alpha'), sibling('beta'), sibling('gamma'), sibling('delta'), outsider],
      },
    }
  }

  const query = { q: '', category: '', sort: 'stars' as const }

  it('gives a repository one seat on every board ranked by a repository metric', () => {
    const { rankings } = buildCatalog(monorepoResult(), query)

    for (const board of ['stars', 'growth24h', 'growth7d', 'growth30d', 'newest', 'active'] as const) {
      // Four identical star counts used to take four seats and tell the reader
      // nothing with three of them.
      expect(rankings[board].map((plugin) => plugin.id))
        .toEqual(['mono/repo/packages/alpha', 'solo/plugin'])
      expect(rankings[board][0]?.repositorySiblings).toBe(3)
      expect(rankings[board][1]?.repositorySiblings).toBe(0)
    }
  })

  it('leaves the install boards alone, because installs tell siblings apart', () => {
    const result = monorepoResult()
    result.snapshot.plugins = result.snapshot.plugins.map((plugin, index) => ({
      ...plugin,
      installCount: (index + 1) * 10,
      installs24h: (index + 1) * 10,
      installs7d: (index + 1) * 10,
      installs30d: (index + 1) * 10,
    }))

    const { rankings } = buildCatalog(result, query)

    for (const board of ['installs', 'installs24h', 'installs7d', 'installs30d'] as const) {
      // A repository that earned four seats here earned each of them.
      expect(rankings[board]).toHaveLength(5)
      expect(rankings[board].every((plugin) => plugin.repositorySiblings === 0)).toBe(true)
    }
  })

  it('keeps the best-ranked sibling as the seat', () => {
    const result = monorepoResult()
    result.snapshot.plugins = result.snapshot.plugins.map((plugin) => (
      plugin.id === 'mono/repo/packages/gamma'
        ? { ...plugin, pushedAt: '2026-08-20T12:00:00Z' }
        : plugin
    ))

    const { rankings } = buildCatalog(result, query)

    expect(rankings.active[0]?.id).toBe('mono/repo/packages/gamma')
    expect(rankings.active[0]?.repositorySiblings).toBe(3)
  })

  it('does not collapse the catalog listing itself', () => {
    // Searching for a package must find that package, not its repository.
    const { packages } = buildCatalog(monorepoResult(), query)

    expect(packages).toHaveLength(5)
  })
})

describe('listing payload', () => {
  it('keeps install and installMethods in packages and rankings', () => {
    const result = testCatalogResult()
    const withMethods = {
      ...result,
      snapshot: {
        ...result.snapshot,
        plugins: result.snapshot.plugins.map((plugin) => ({
          ...plugin,
          installMethods: [{
            kind: 'github' as const,
            spec: `github:${plugin.id}`,
            command: `dsh plugin add github:${plugin.id}`,
            verification: 'verified' as const,
            code: 'entry_committed' as const,
            requiresBuildAllowance: false,
            revision: 'abc1234',
            checkedAt: '2026-08-18T00:00:00.000Z',
          }],
        })),
      },
    }

    const catalog = buildCatalog(withMethods, parseCatalogQuery({}))

    expect(catalog.packages.length).toBeGreaterThan(0)
    expect(catalog.rankings.stars.length).toBeGreaterThan(0)
    for (const plugin of [...catalog.packages, ...catalog.rankings.stars]) {
      expect(plugin.install).toEqual(expect.any(String))
      expect(plugin.installMethods).toHaveLength(1)
    }
    expect(JSON.parse(JSON.stringify(catalog)).packages[0]).toMatchObject({
      install: expect.any(String),
      installMethods: expect.any(Array),
    })
  })

  it('keeps the fields the listing actually renders', () => {
    const catalog = buildCatalog(testCatalogResult(), parseCatalogQuery({}))
    expect(catalog.packages[0]).toMatchObject({
      id: expect.any(String),
      description: expect.objectContaining({ en: expect.any(String), zh: expect.any(String) }),
      install: expect.any(String),
    })
  })
})

describe('edge cache allowlist', () => {
  it('never caches a per-caller or streaming route', () => {
    // A path forgotten here is a user's response handed to the next caller, so
    // the guard is an allowlist and this test is the list.
    for (const pathname of [
      '/api/live',
      '/api/v1/plugins/search',
      '/api/v1/auth/me',
      '/api/v1/auth/github/callback',
      '/api/v1/api-keys',
      '/api/v1/community/posts',
      '/api/v1/self/install-stats',
      '/api/v1/health',
      '/api/v1/install-events',
      '/assets/index-abc123.js',
    ]) {
      expect(edgeCacheablePath(pathname), pathname).toBe(false)
    }
  })

  it('caches the catalog endpoints and the document routes', () => {
    for (const pathname of [
      '/api/v1/plugins',
      '/api/v1/registry',
      '/',
      '/plugins',
      '/rankings',
      '/robots.txt',
      '/sitemap.xml',
    ]) {
      expect(edgeCacheablePath(pathname), pathname).toBe(true)
    }
  })
})

describe('conditional catalog requests', () => {
  const etag = weakEtag(['2026-08-18T15:00:00.000Z', 'kv', '', '', 'stars'])

  function responseWith(tag: string | null): Response {
    const headers = new Headers({ 'Cache-Control': 'public, max-age=300', 'X-Catalog-Source': 'kv' })
    if (tag) headers.set('ETag', tag)
    return new Response('{"packages":[]}', { headers })
  }

  function conditional(ifNoneMatch: string | null): Request {
    return new Request('https://deepseek1024.com/api/v1/plugins', {
      headers: ifNoneMatch ? { 'If-None-Match': ifNoneMatch } : {},
    })
  }

  it('moves whenever any part of the identity moves', () => {
    const base = ['2026-08-18T15:00:00.000Z', 'kv', '', '', 'stars']
    expect(weakEtag(base)).toBe(weakEtag([...base]))
    for (const changed of [
      ['2026-08-18T15:15:00.000Z', 'kv', '', '', 'stars'],
      ['2026-08-18T15:00:00.000Z', 'stale', '', '', 'stars'],
      ['2026-08-18T15:00:00.000Z', 'kv', 'terminal', '', 'stars'],
      ['2026-08-18T15:00:00.000Z', 'kv', '', 'ui', 'stars'],
      ['2026-08-18T15:00:00.000Z', 'kv', '', '', 'newest'],
    ]) {
      expect(weakEtag(changed), changed.join('|')).not.toBe(weakEtag(base))
    }
  })

  it('answers a matching validator with an empty 304', async () => {
    // A client polling for changes otherwise re-downloads the whole catalog to
    // be told nothing moved.
    const notModified = notModifiedFor(conditional(etag), responseWith(etag))
    expect(notModified?.status).toBe(304)
    expect(await notModified?.text()).toBe('')
    expect(notModified?.headers.get('ETag')).toBe(etag)
    // A 304 has to carry forward the freshness information, or the caller has
    // nothing left to decide with.
    expect(notModified?.headers.get('Cache-Control')).toBe('public, max-age=300')
  })

  it('tolerates the forms a client may send the validator in', () => {
    expect(notModifiedFor(conditional(etag.replace('W/', '')), responseWith(etag))).not.toBeNull()
    expect(notModifiedFor(conditional(`"stale", ${etag}`), responseWith(etag))).not.toBeNull()
    expect(notModifiedFor(conditional('*'), responseWith(etag))).not.toBeNull()
  })

  it('serves the body when the validator is stale, absent, or unmatchable', () => {
    expect(notModifiedFor(conditional(weakEtag(['other'])), responseWith(etag))).toBeNull()
    expect(notModifiedFor(conditional(null), responseWith(etag))).toBeNull()
    expect(notModifiedFor(conditional(etag), responseWith(null))).toBeNull()
  })
})
