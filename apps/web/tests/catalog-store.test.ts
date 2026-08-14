import { describe, expect, it, vi } from 'vitest'
import { BUNDLED_REGISTRY } from '../worker/lib/registry'
import { isStoredCatalogSnapshot, loadCatalogSnapshot, refreshCatalogSnapshot } from '../worker/lib/catalog-store'
import { TEST_REGISTRY, testCatalogResult } from './fixtures'

describe('catalog snapshot storage', () => {
  it('accepts generated snapshots and rejects incomplete values', () => {
    expect(isStoredCatalogSnapshot(testCatalogResult().snapshot)).toBe(true)
    expect(isStoredCatalogSnapshot({ generatedAt: '2026-08-14T00:00:00Z' })).toBe(false)
  })

  it('returns a fresh KV snapshot without outbound requests', async () => {
    const snapshot = { ...testCatalogResult().snapshot, generatedAt: new Date().toISOString() }
    const get = vi.fn(async () => snapshot)
    const env = { CATALOG_CACHE: { get }, GITHUB_TOKEN: '' } as unknown as Env
    const fetcher = vi.fn() as unknown as typeof fetch

    const result = await loadCatalogSnapshot(env, undefined, fetcher)
    expect(result.source).toBe('kv')
    expect(result.snapshot.plugins).toHaveLength(TEST_REGISTRY.plugins.length)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('accepts a fresh KV snapshot with a D1-generated catalog revision', async () => {
    const snapshot = {
      ...testCatalogResult().snapshot,
      generatedAt: new Date().toISOString(),
      registryRevision: `sha256:${'0'.repeat(64)}`,
    }
    const env = {
      CATALOG_CACHE: { get: vi.fn(async () => snapshot) },
      GITHUB_TOKEN: '',
    } as unknown as Env
    const fetcher = vi.fn(async () => Response.json({ items: [] })) as unknown as typeof fetch

    const result = await loadCatalogSnapshot(env, undefined, fetcher)
    expect(result.source).toBe('kv')
    expect(result.snapshot.registryRevision).toBe(`sha256:${'0'.repeat(64)}`)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('writes the bundled registry and its GitHub metrics to KV', async () => {
    const put = vi.fn(async () => undefined)
    const get = vi.fn(async () => null)
    const env = { CATALOG_CACHE: { get, put }, GITHUB_TOKEN: 'token' } as unknown as Env
    const fetcher = vi.fn(async (_input: string | URL | Request) => {
      return Response.json({
        data: Object.fromEntries(
          BUNDLED_REGISTRY.plugins.map((_plugin, index) => [
            `r${index}`,
            {
              stargazerCount: index + 1,
              forkCount: index,
              pushedAt: '2026-08-14T00:00:00Z',
              updatedAt: '2026-08-14T00:00:00Z',
              releases: { nodes: [] },
            },
          ]),
        ),
      })
    }) as unknown as typeof fetch

    const result = await refreshCatalogSnapshot(env, fetcher)
    expect(result.source).toBe('bundled')
    expect(result.snapshot.metricCoverage).toBe(BUNDLED_REGISTRY.plugins.length)
    expect(put).toHaveBeenCalledOnce()
  })

  it('retains the previous metrics when GitHub refresh fails', async () => {
    const previous = testCatalogResult('kv').snapshot
    const put = vi.fn(async () => undefined)
    const env = {
      CATALOG_CACHE: { get: vi.fn(async () => previous), put },
      GITHUB_TOKEN: 'token',
    } as unknown as Env
    const fetcher = vi.fn(async (_input: string | URL | Request) => {
      return Response.json({ errors: [{ message: 'temporary failure' }] })
    }) as unknown as typeof fetch

    const result = await refreshCatalogSnapshot(env, fetcher)
    const retained = result.snapshot.plugins.find((plugin) => plugin.url === previous.plugins[0]?.url)
    expect(retained?.stars).toBe(previous.plugins[0]?.stars)
    expect(result.snapshot.metricCoverage).toBe(previous.metricCoverage)
    expect(put).toHaveBeenCalledOnce()
  })
})
