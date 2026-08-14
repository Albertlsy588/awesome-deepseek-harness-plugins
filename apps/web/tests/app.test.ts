import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../worker/app'
import type { PackageDetail } from '../worker/types'
import { TEST_PLUGINS, testCatalogResult } from './fixtures'

function testApp() {
  const detail = {
    ...TEST_PLUGINS[0],
    github: null,
    manifest: null,
    readme: null,
    verification: { repositoryReachable: false, bundleDeclared: false },
  } satisfies PackageDetail

  return createApp({
    catalogLoader: vi.fn(async () => testCatalogResult()),
    detailLoader: vi.fn(async () => detail),
  })
}

describe('market API', () => {
  it('reports service health', async () => {
    const response = await testApp().request('/api/health')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ ok: true, service: 'dsh-store' })
  })

  it('serves the generated public registry with cross-origin access', async () => {
    const response = await testApp().request('/plugins.json', {
      headers: { Origin: 'https://registry-consumer.example' },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    const body = (await response.json()) as { count: number; revision: string; plugins: unknown[] }
    expect(body.count).toBe(TEST_PLUGINS.length)
    expect(body.plugins).toHaveLength(body.count)
    expect(body.revision).toBe(testCatalogResult().snapshot.registryRevision)
    expect(response.headers.get('X-Catalog-Source')).toBe('bundled')
  })

  it('permanently redirects legacy package URLs to canonical plugin paths', async () => {
    const app = testApp()
    const catalog = await app.request('https://store.example/packages?q=terminal')
    const detail = await app.request(
      'https://store.example/packages/openma-ai/deepseek-harness-tui?source=legacy',
    )
    const apiCatalog = await app.request('https://store.example/api/packages?q=terminal')
    const apiDetail = await app.request(
      'https://store.example/api/packages/openma-ai/deepseek-harness-tui?source=legacy',
    )

    expect(catalog.status).toBe(301)
    expect(catalog.headers.get('Location')).toBe('https://store.example/plugin?q=terminal')
    expect(detail.status).toBe(301)
    expect(detail.headers.get('Location')).toBe(
      'https://store.example/plugin/openma-ai/deepseek-harness-tui?source=legacy',
    )
    expect(apiCatalog.status).toBe(301)
    expect(apiCatalog.headers.get('Location')).toBe('https://store.example/api/plugin?q=terminal')
    expect(apiDetail.status).toBe(301)
    expect(apiDetail.headers.get('Location')).toBe(
      'https://store.example/api/plugin/openma-ai/deepseek-harness-tui?source=legacy',
    )
  })

  it('returns every filtered result with rankings and cache metadata', async () => {
    const response = await testApp().request('/api/plugin?category=fun&q=gomoku')
    expect(response.status).toBe(200)
    expect(response.headers.get('X-Catalog-Source')).toBe('bundled')
    const body = (await response.json()) as {
      packages: Array<{ name: string }>
      rankings: { stars: Array<{ name: string }> }
      meta: { total: number; catalogTotal: number }
    }
    expect(body.packages.map((plugin) => plugin.name)).toEqual(['dsh-gomoku'])
    expect(body.rankings.stars[0]?.name).toBe('dsh-crosstalk')
    expect(body.meta).toMatchObject({ total: 1, catalogTotal: 7 })
  })

  it('serves curated package details and rejects invalid identifiers', async () => {
    const app = testApp()
    const detail = await app.request('/api/plugin/openma-ai/deepseek-harness-tui')
    expect(detail.status).toBe(200)

    const invalid = await app.request('/api/plugin/openma-ai/not%20valid')
    expect(invalid.status).toBe(400)

    const missing = await app.request('/api/plugin/openma-ai/missing')
    expect(missing.status).toBe(404)
  })
})
