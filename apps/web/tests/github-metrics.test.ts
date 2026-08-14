import { describe, expect, it, vi } from 'vitest'
import { fetchGitHubMetrics, metricKey } from '../worker/lib/github-metrics'
import { TEST_REGISTRY } from './fixtures'

describe('GitHub catalog metrics', () => {
  it('batches curated repositories through GraphQL when a token is present', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const query = JSON.parse(String(init?.body)) as { query: string }
      expect(query.query).toContain('stargazerCount')
      return Response.json({
        data: Object.fromEntries(
          TEST_REGISTRY.plugins.map((_plugin, index) => [
            `r${index}`,
            {
              stargazerCount: 100 - index,
              forkCount: index,
              pushedAt: '2026-08-14T00:00:00Z',
              updatedAt: '2026-08-14T00:00:00Z',
              releases: { nodes: [{ publishedAt: '2026-08-13T00:00:00Z' }] },
            },
          ]),
        ),
      })
    }) as unknown as typeof fetch

    const metrics = await fetchGitHubMetrics(TEST_REGISTRY.plugins, 'token', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(metrics.get(metricKey(TEST_REGISTRY.plugins[0]))).toMatchObject({
      stars: 100,
      latestReleaseAt: '2026-08-13T00:00:00Z',
    })
  })

  it('uses two public search requests as the tokenless fallback', async () => {
    const plugin = TEST_REGISTRY.plugins[0]
    const fetcher = vi.fn(async () => Response.json({
      items: [{
        full_name: `${plugin.owner}/${plugin.name}`,
        stargazers_count: 33,
        forks_count: 4,
        pushed_at: '2026-08-14T00:00:00Z',
        updated_at: '2026-08-14T00:00:00Z',
      }],
    })) as unknown as typeof fetch

    const metrics = await fetchGitHubMetrics(TEST_REGISTRY.plugins, undefined, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(metrics.get(metricKey(plugin))?.stars).toBe(33)
  })
})
