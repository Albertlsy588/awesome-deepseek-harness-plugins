import { describe, expect, it } from 'vitest'
import { buildCatalog, findPlugin, parseCatalogQuery, repositoryName } from '../worker/lib/catalog'
import { TEST_PLUGINS, TEST_REGISTRY, testCatalogResult } from './fixtures'

describe('catalog queries', () => {
  it('normalizes search text and invalid sort values', () => {
    expect(parseCatalogQuery({ q: '  terminal  ', sort: 'downloads' })).toEqual({
      q: 'terminal',
      category: '',
      sort: 'stars',
    })
  })

  it('searches localized descriptions, filters categories, and does not paginate', () => {
    const result = buildCatalog(testCatalogResult(), {
      q: '终端',
      category: 'tools',
      sort: 'newest',
    })

    expect(result.packages.map((plugin) => plugin.name)).toEqual(['dsh-bash-terminal'])
    expect(result.meta).toMatchObject({ total: 1, catalogTotal: 7 })
    expect(result.categories).toHaveLength(7)
    expect(result.meta).not.toHaveProperty('page')
  })

  it('sorts all packages and builds stable ranking groups', () => {
    const result = buildCatalog(testCatalogResult(), { q: '', category: '', sort: 'name' })

    expect(result.packages).toHaveLength(TEST_PLUGINS.length)
    expect(result.packages[0]?.name).toBe('deepseek-harness-tui')
    expect(result.rankings.stars[0]?.name).toBe('dsh-crosstalk')
    expect(result.rankings.newest[0]?.name).toBe('dsh-agent-teams')
    expect(result.rankings.active[0]?.name).toBe('deepseek-harness-tui')
    expect(result.rankings.stars).toHaveLength(TEST_PLUGINS.length)
    expect(result.rankings.newest).toHaveLength(TEST_PLUGINS.length)
    expect(result.rankings.active).toHaveLength(TEST_PLUGINS.length)
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
