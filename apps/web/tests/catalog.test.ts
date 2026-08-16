import { describe, expect, it } from 'vitest'
import {
  buildCatalog,
  deriveCatalogResponse,
  findPlugin,
  parseCatalogQuery,
  repositoryName,
} from '../worker/lib/catalog'
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
    expect(result.rankings.stars).toHaveLength(TEST_PLUGINS.length)
    expect(result.rankings.newest).toHaveLength(TEST_PLUGINS.length)
    expect(result.rankings.active).toHaveLength(TEST_PLUGINS.length)
    expect(result.rankings.growth24h).toHaveLength(TEST_PLUGINS.length - 1)
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
