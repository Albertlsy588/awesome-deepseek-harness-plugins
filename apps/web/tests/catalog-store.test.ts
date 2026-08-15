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

  it('merges D1 installation aggregates into every refreshed catalog entry', async () => {
    const first = BUNDLED_REGISTRY.plugins[0]!
    const repository = new URL(first.url).pathname.split('/').filter(Boolean)[1]!
    const pluginId = `${first.owner}/${repository}`
    const prepare = vi.fn((sql: string) => {
      const statement = {
        bind() {
          return statement
        },
        async all() {
          if (sql.includes('plugin_hourly_stats')) {
            return {
              results: [{
                plugin_id: pluginId,
                install_count: 9,
                first_install_count: 7,
                reinstall_count: 2,
                update_count: 1,
                remove_count: 1,
                failure_count: 3,
                installs_24h: 2,
                installs_7d: 5,
                installs_30d: 9,
                latest_install_at: '2026-08-14T12:00:00.000Z',
              }],
            }
          }
          return { results: [{ plugin_id: pluginId, installer_count: 6 }] }
        },
      }
      return statement
    })
    const env = {
      CATALOG_CACHE: {
        get: vi.fn(async () => null),
        put: vi.fn(async () => undefined),
      },
      CATALOG_DB: { prepare },
      GITHUB_TOKEN: '',
    } as unknown as Env
    const fetcher = vi.fn(async () => Response.json({ items: [] })) as unknown as typeof fetch

    const result = await refreshCatalogSnapshot(env, fetcher, Date.parse('2026-08-14T13:00:00Z'))
    const tracked = result.snapshot.plugins.find((plugin) =>
      plugin.owner === first.owner && plugin.repository === repository)
    const untracked = result.snapshot.plugins.find((plugin) => plugin.url !== first.url)

    expect(tracked).toMatchObject({
      installCount: 9,
      installerCount: 6,
      firstInstallCount: 7,
      reinstallCount: 2,
      installs24h: 2,
      installs7d: 5,
      installs30d: 9,
      latestInstallAt: '2026-08-14T12:00:00.000Z',
    })
    expect(untracked).toMatchObject({ installCount: 0, installerCount: 0, latestInstallAt: null })
  })
})
