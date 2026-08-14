import { describe, expect, it, vi } from 'vitest'
import {
  createGitHubClient,
  discoverRepositories,
  incrementalStart,
  inspectRepository,
  type GitHubRepository,
} from '../worker/lib/github-discovery'

function repository(overrides: Partial<GitHubRepository> = {}): GitHubRepository {
  return {
    id: 42,
    name: 'plugin',
    full_name: 'owner/plugin',
    html_url: 'https://github.com/owner/plugin',
    description: 'A plugin',
    fork: false,
    archived: false,
    disabled: false,
    default_branch: 'main',
    stargazers_count: 12,
    forks_count: 3,
    language: 'TypeScript',
    license: { spdx_id: 'MIT' },
    updated_at: '2026-08-14T12:00:00Z',
    pushed_at: '2026-08-14T11:00:00Z',
    ...overrides,
  }
}

function encodedJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64')
}

describe('Cloudflare GitHub discovery', () => {
  it('uses an overlap window and exhausts incremental search pages', async () => {
    expect(incrementalStart('2026-08-14T12:00:00Z')).toBe('2026-08-14T11:55:00Z')
    const request = vi.fn(async (_path: string) => ({
      total_count: 1,
      incomplete_results: false,
      items: [repository()],
    }))
    const repositories = await discoverRepositories(
      { request } as unknown as ReturnType<typeof createGitHubClient>,
      'dsh-plugin',
      'incremental',
      '2026-08-14T11:55:00Z',
      '2026-08-14T12:30:00Z',
    )

    expect(repositories.map((item) => item.id)).toEqual([42])
    expect(request).toHaveBeenCalledOnce()
    expect(request.mock.calls[0]?.[0]).toContain('updated%3A2026-08-14T11%3A55%3A00Z..2026-08-14T12%3A30%3A00Z')
  })

  it('validates a nested monorepo package without downloading dependencies', async () => {
    const request = vi.fn(async (path: string) => {
      if (path.includes('/git/trees/')) {
        return {
          truncated: false,
          tree: [
            { path: 'package.json', mode: '100644', type: 'blob', sha: 'root' },
            { path: 'packages/plugin/package.json', mode: '100644', type: 'blob', sha: 'nested' },
            { path: 'packages/plugin/plugin.patch', mode: '100644', type: 'blob', sha: 'patch' },
          ],
        }
      }
      if (path.endsWith('/root')) {
        return { encoding: 'base64', content: encodedJson({ name: 'workspace' }) }
      }
      return {
        encoding: 'base64',
        content: encodedJson({
          name: '@owner/plugin',
          version: '1.0.0',
          dsh: { bundle: { patch: './plugin.patch' } },
        }),
      }
    })

    const result = await inspectRepository(
      { request } as unknown as ReturnType<typeof createGitHubClient>,
      repository(),
    )

    expect(result).toMatchObject({
      githubId: 42,
      status: 'accepted',
      package: {
        name: '@owner/plugin',
        path: 'packages/plugin/package.json',
        patch: 'packages/plugin/plugin.patch',
      },
    })
    expect(request).toHaveBeenCalledTimes(3)
  })

  it('paces repository search after the first request', async () => {
    const waiter = vi.fn(async () => undefined)
    const fetcher = vi.fn(async () => Response.json({ ok: true })) as unknown as typeof fetch
    const client = createGitHubClient('token', fetcher, waiter)

    await client.request('/search/repositories?q=one', true)
    await client.request('/search/repositories?q=two', true)

    expect(waiter).toHaveBeenCalledWith(2_100)
  })
})
