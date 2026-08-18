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

  it('keeps the repositories that answered when one of them is gone', async () => {
    // A deleted, renamed or newly private repository comes back as a NOT_FOUND
    // entry in `errors` while `data` still holds the rest of the batch.
    // Aborting on any error at all discarded up to eighty live repositories
    // over one dead one, and their star counts silently went missing.
    const [alive, ...rest] = TEST_REGISTRY.plugins
    const fetcher = vi.fn(async () => Response.json({
      data: {
        r0: {
          stargazerCount: 42,
          forkCount: 7,
          pushedAt: '2026-08-18T00:00:00Z',
          updatedAt: '2026-08-18T00:00:00Z',
          releases: { nodes: [] },
        },
        ...Object.fromEntries(rest.map((_plugin, index) => [`r${index + 1}`, null])),
      },
      errors: rest.map((plugin) => ({
        type: 'NOT_FOUND',
        message: `Could not resolve to a Repository with the name '${plugin.owner}/${plugin.name}'.`,
      })),
    })) as unknown as typeof fetch

    const metrics = await fetchGitHubMetrics(TEST_REGISTRY.plugins, 'token', fetcher)

    expect(metrics.get(metricKey(alive))).toMatchObject({ stars: 42, forks: 7 })
    for (const plugin of rest) {
      expect(metrics.has(metricKey(plugin))).toBe(false)
    }
  })

  it('still gives up when the whole query failed', async () => {
    // A rate limit or a rejected token answers with no `data` at all — nothing
    // was returned to salvage, so the sweep aborts rather than writing a
    // catalog-wide blank over every star count.
    const fetcher = vi.fn(async () => Response.json({
      data: null,
      errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded' }],
    })) as unknown as typeof fetch

    const metrics = await fetchGitHubMetrics(TEST_REGISTRY.plugins, 'token', fetcher)

    expect(metrics.size).toBe(0)
  })
})
