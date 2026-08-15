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

  it.each([
    [{ full_name: 'deepseek-ai/deepseek-harness' }, 'excluded_repository'],
    [{ fork: true }, 'fork'],
    [{ archived: true }, 'archived'],
    [{ disabled: true }, 'disabled'],
    [{ default_branch: '' }, 'missing_default_branch'],
  ])('rejects repository metadata before making API calls', async (overrides, code) => {
    const request = vi.fn()

    const result = await inspectRepository(
      { request } as unknown as ReturnType<typeof createGitHubClient>,
      repository(overrides),
    )

    expect(result).toMatchObject({ status: 'rejected', code })
    expect(request).not.toHaveBeenCalled()
  })

  it.each([
    [{ truncated: true, tree: [] }, 'truncated_tree'],
    [{ truncated: false, tree: [] }, 'missing_package'],
  ])('rejects an unusable repository tree', async (tree, code) => {
    const request = vi.fn(async () => tree)

    const result = await inspectRepository(
      { request } as unknown as ReturnType<typeof createGitHubClient>,
      repository(),
    )

    expect(result).toMatchObject({ status: 'rejected', code })
  })

  it.each([
    [{ encoding: 'utf-8', content: '{}' }, 'unreadable_file'],
    [{ encoding: 'base64', content: Buffer.from('{').toString('base64') }, 'invalid_package'],
    [{ encoding: 'base64', content: encodedJson({ name: 'plugin' }) }, 'missing_bundle'],
    [{
      encoding: 'base64',
      content: encodedJson({ name: 'plugin', dsh: { bundle: { patch: '../../escape.patch' } } }),
    }, 'invalid_bundle_patch'],
    [{
      encoding: 'base64',
      content: encodedJson({ name: 'plugin', dsh: { bundle: { patch: './missing.patch' } } }),
    }, 'missing_bundle_patch'],
  ])('rejects an invalid plugin manifest without aborting the scan', async (blob, code) => {
    const request = vi.fn(async (path: string) => path.includes('/git/trees/')
      ? {
          truncated: false,
          tree: [
            { path: 'package.json', mode: '100644', type: 'blob', sha: 'manifest' },
            { path: 'plugin.patch', mode: '100644', type: 'blob', sha: 'patch' },
          ],
        }
      : blob)

    const result = await inspectRepository(
      { request } as unknown as ReturnType<typeof createGitHubClient>,
      repository(),
    )

    expect(result).toMatchObject({ status: 'rejected', code })
  })

  it.each([
    [404, 'Not Found', 'repository_unavailable'],
    [409, 'Git Repository is empty.', 'empty_repository'],
    [410, 'Gone', 'repository_unavailable'],
    [422, 'Reference does not exist', 'invalid_repository_tree'],
  ])('isolates repository-scoped GitHub API status %i', async (status, message, code) => {
    const fetcher = vi.fn(async () => Response.json({ message }, { status })) as unknown as typeof fetch

    const result = await inspectRepository(createGitHubClient('token', fetcher), repository({
      full_name: 'ShawnSiao/dsh-agent-eval',
    }))

    expect(result).toMatchObject({
      githubId: 42,
      status: 'rejected',
      code,
    })
  })

  it('does not hide authentication or rate-limit failures as repository rejections', async () => {
    const fetcher = vi.fn(async () => Response.json(
      { message: 'API rate limit exceeded' },
      { status: 403, headers: { 'x-ratelimit-remaining': '0' } },
    )) as unknown as typeof fetch

    await expect(inspectRepository(createGitHubClient('token', fetcher), repository()))
      .rejects.toMatchObject({
        name: 'GitHubApiError',
        status: 403,
        rateLimitRemaining: 0,
      })
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
