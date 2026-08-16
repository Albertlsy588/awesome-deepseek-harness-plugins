import { describe, expect, it, vi } from 'vitest'
import {
  createGitHubClient,
  discoveryInternals,
  discoverRepositories,
  GitHubApiError,
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
  it('uses an overlap window and combines created and pushed incremental searches', async () => {
    expect(incrementalStart('2026-08-14T12:00:00Z')).toBe('2026-08-14T11:55:00Z')
    const request = vi.fn(async (path: string) => path.includes('created%3A')
      ? {
          total_count: 1,
          incomplete_results: false,
          items: [repository()],
        }
      : {
          total_count: 2,
          incomplete_results: false,
          items: [repository(), repository({ id: 43, full_name: 'owner/second-plugin' })],
        })
    const repositories = await discoverRepositories(
      { request } as unknown as ReturnType<typeof createGitHubClient>,
      'dsh-plugin',
      'incremental',
      '2026-08-14T11:55:00Z',
      '2026-08-14T12:30:00Z',
    )

    expect(repositories.map((item) => item.id)).toEqual([42, 43])
    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls[0]?.[0]).toContain('created%3A2026-08-14T11%3A55%3A00Z..2026-08-14T12%3A30%3A00Z')
    expect(request.mock.calls[1]?.[0]).toContain('pushed%3A2026-08-14T11%3A55%3A00Z..2026-08-14T12%3A30%3A00Z')
    expect(request.mock.calls[0]?.[0]).toContain('sort=updated')
    expect(request.mock.calls[1]?.[0]).toContain('sort=updated')
    expect(request.mock.calls.flat().join(' ')).not.toContain('updated%3A')
  })

  it('forces one full discovery when the search strategy version changes', () => {
    const watermark = '2026-08-14T12:00:00Z'
    expect(discoveryInternals.selectMode(undefined, null, null)).toBe('full')
    expect(discoveryInternals.selectMode(undefined, watermark, null)).toBe('full')
    expect(discoveryInternals.selectMode(
      undefined,
      watermark,
      discoveryInternals.strategyVersion,
    )).toBe('incremental')
    expect(discoveryInternals.selectMode('full', watermark, discoveryInternals.strategyVersion))
      .toBe('full')
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
      nextManifestCursor: null,
      packages: [{
        name: '@owner/plugin',
        path: 'packages/plugin/package.json',
        patch: 'packages/plugin/plugin.patch',
      }],
    })
    expect(request).toHaveBeenCalledTimes(3)
  })

  it('collects every package of a monorepo, not just the first one that validates', async () => {
    const names = ['aionui-panel', 'git-graph', 'pet', 'task-board']
    const request = vi.fn(async (path: string) => {
      if (path.includes('/git/trees/')) {
        return {
          truncated: false,
          tree: [
            { path: 'package.json', mode: '100644', type: 'blob', sha: 'root' },
            ...names.flatMap((name) => [
              { path: `packages/${name}/package.json`, mode: '100644', type: 'blob', sha: name },
              { path: `packages/${name}/cordis.patch.yml`, mode: '100644', type: 'blob', sha: `${name}-patch` },
            ]),
          ],
        }
      }
      if (path.endsWith('/root')) {
        return { encoding: 'base64', content: encodedJson({ name: 'workspace' }) }
      }
      const name = path.split('/').at(-1)
      return {
        encoding: 'base64',
        content: encodedJson({
          name: `@owner/${name}`,
          version: '1.0.0',
          dsh: { bundle: { patch: './cordis.patch.yml' } },
        }),
      }
    })

    const result = await inspectRepository(
      { request } as unknown as ReturnType<typeof createGitHubClient>,
      repository(),
    )

    expect(result.status).toBe('accepted')
    expect(result.nextManifestCursor).toBeNull()
    expect(result.packages.map((item) => item.path)).toEqual(
      names.map((name) => `packages/${name}/package.json`),
    )
    // The workspace root is read and rejected, then all four packages.
    expect(request).toHaveBeenCalledTimes(6)
  })

  it('resumes a sweep that ran out of blob budget instead of discarding the tail', async () => {
    const names = ['alpha', 'beta', 'gamma']
    const request = vi.fn(async (path: string) => path.includes('/git/trees/')
      ? {
          truncated: false,
          tree: names.flatMap((name) => [
            { path: `packages/${name}/package.json`, mode: '100644', type: 'blob', sha: name },
            { path: `packages/${name}/plugin.patch`, mode: '100644', type: 'blob', sha: `${name}-patch` },
          ]),
        }
      : {
          encoding: 'base64',
          content: encodedJson({
            name: `@owner/${path.split('/').at(-1)}`,
            dsh: { bundle: { patch: './plugin.patch' } },
          }),
        })
    const client = { request } as unknown as ReturnType<typeof createGitHubClient>

    const first = await inspectRepository(client, repository(), null, 2)
    expect(first.packages.map((item) => item.name)).toEqual(['@owner/alpha', '@owner/beta'])
    expect(first.sweepRestarted).toBe(true)
    expect(first.nextManifestCursor).toBe('packages/beta/package.json')

    const second = await inspectRepository(client, repository(), first.nextManifestCursor, 2)
    expect(second.packages.map((item) => item.name)).toEqual(['@owner/gamma'])
    expect(second.sweepRestarted).toBe(false)
    expect(second.nextManifestCursor).toBeNull()
  })

  it('resumes by path, so a manifest removed ahead of the cursor cannot shift the window', async () => {
    const names = ['alpha', 'beta', 'gamma', 'delta']
    const present = new Set(names)
    const request = vi.fn(async (path: string) => path.includes('/git/trees/')
      ? {
          truncated: false,
          tree: [...present].flatMap((name) => [
            { path: `packages/${name}/package.json`, mode: '100644', type: 'blob', sha: name },
            { path: `packages/${name}/plugin.patch`, mode: '100644', type: 'blob', sha: `${name}-patch` },
          ]),
        }
      : {
          encoding: 'base64',
          content: encodedJson({
            name: `@owner/${path.split('/').at(-1)}`,
            dsh: { bundle: { patch: './plugin.patch' } },
          }),
        })
    const client = { request } as unknown as ReturnType<typeof createGitHubClient>

    // Sweep order is alpha, beta, delta, gamma (depth then locale compare).
    const first = await inspectRepository(client, repository(), null, 2)
    expect(first.packages.map((item) => item.name)).toEqual(['@owner/alpha', '@owner/beta'])
    expect(first.nextManifestCursor).toBe('packages/beta/package.json')

    // The first package is deleted between passes. A positional cursor would
    // now point one entry too far and skip `delta`, whose plugin row the
    // finishing sweep would then retire as if the package had vanished.
    present.delete('alpha')
    const second = await inspectRepository(client, repository(), first.nextManifestCursor, 2)

    expect(second.packages.map((item) => item.name)).toEqual(['@owner/delta', '@owner/gamma'])
    expect(second.nextManifestCursor).toBeNull()
  })

  it.each([
    // Representable directory, but the id built from this repository's real
    // name still overruns the cap — the placeholder prefix pluginPathFromPackagePath
    // measures against is shorter than the actual `owner/repository`.
    [`packages/${'d'.repeat(175)}`, `${'a'.repeat(30)}/${'b'.repeat(30)}`, 'plugin_id_too_long'],
    // No plugin id can carry this directory at all. Answering '' for it would
    // file the package against the repository-root plugin row instead.
    ['packages/插件-pet', 'owner/plugin', 'unrepresentable_plugin_path'],
  ])('refuses a manifest no plugin id can address (%#)', async (directory, fullName, code) => {
    const request = vi.fn(async (path: string) => path.includes('/git/trees/')
      ? {
          truncated: false,
          tree: [
            { path: `${directory}/package.json`, mode: '100644', type: 'blob', sha: 'deep' },
            { path: `${directory}/plugin.patch`, mode: '100644', type: 'blob', sha: 'patch' },
          ],
        }
      : {
          encoding: 'base64',
          content: encodedJson({ name: '@owner/deep', dsh: { bundle: { patch: './plugin.patch' } } }),
        })

    const result = await inspectRepository(
      { request } as unknown as ReturnType<typeof createGitHubClient>,
      repository({ full_name: fullName }),
    )

    // Publishing either would emit an install command that installs something
    // other than the package it names.
    expect(result).toMatchObject({ status: 'rejected', code, packages: [] })
  })

  it('restarts a sweep whose cursor outran a tree that has since shrunk', async () => {
    const request = vi.fn(async (path: string) => path.includes('/git/trees/')
      ? {
          truncated: false,
          tree: [
            { path: 'package.json', mode: '100644', type: 'blob', sha: 'manifest' },
            { path: 'plugin.patch', mode: '100644', type: 'blob', sha: 'patch' },
          ],
        }
      : {
          encoding: 'base64',
          content: encodedJson({ name: '@owner/plugin', dsh: { bundle: { patch: './plugin.patch' } } }),
        })

    const result = await inspectRepository(
      { request } as unknown as ReturnType<typeof createGitHubClient>,
      repository(),
      // A cursor left behind when the repository had far more packages.
      'packages/zzz-removed/package.json',
    )

    expect(result.sweepRestarted).toBe(true)
    expect(result.packages.map((item) => item.name)).toEqual(['@owner/plugin'])
  })

  it('keeps one plugin per package name and per case-insensitive path', async () => {
    const request = vi.fn(async (path: string) => {
      if (path.includes('/git/trees/')) {
        return {
          truncated: false,
          tree: [
            { path: 'packages/skins/miku/package.json', mode: '100644', type: 'blob', sha: 'a' },
            { path: 'packages/skins/miku/plugin.patch', mode: '100644', type: 'blob', sha: 'ap' },
            { path: 'packages/dsh-skins/skins/miku/package.json', mode: '100644', type: 'blob', sha: 'b' },
            { path: 'packages/dsh-skins/skins/miku/plugin.patch', mode: '100644', type: 'blob', sha: 'bp' },
            { path: 'packages/Solo/package.json', mode: '100644', type: 'blob', sha: 'c' },
            { path: 'packages/Solo/plugin.patch', mode: '100644', type: 'blob', sha: 'cp' },
            { path: 'packages/solo/package.json', mode: '100644', type: 'blob', sha: 'd' },
            { path: 'packages/solo/plugin.patch', mode: '100644', type: 'blob', sha: 'dp' },
          ],
        }
      }
      const shaToName: Record<string, string> = {
        a: '@owner/miku', b: '@owner/miku', c: '@owner/solo-upper', d: '@owner/solo-lower',
      }
      return {
        encoding: 'base64',
        content: encodedJson({
          name: shaToName[path.split('/').at(-1) ?? ''],
          dsh: { bundle: { patch: './plugin.patch' } },
        }),
      }
    })

    const result = await inspectRepository(
      { request } as unknown as ReturnType<typeof createGitHubClient>,
      repository(),
    )

    // The duplicate skin copy loses on name; one of the two case-variant
    // `solo` directories loses on path, because UNIQUE(normalized_plugin_id)
    // cannot hold both. Which one wins is decided by the sweep order alone, so
    // it is stable across passes.
    expect(result.packages.map((item) => item.path)).toEqual([
      'packages/solo/package.json',
      'packages/skins/miku/package.json',
    ])
  })

  it('does not publish a scaffold template as a plugin', async () => {
    const request = vi.fn(async (path: string) => path.includes('/git/trees/')
      ? {
          truncated: false,
          tree: [
            { path: 'scripts/plugin-template/package.json', mode: '100644', type: 'blob', sha: 'template' },
            { path: 'scripts/plugin-template/plugin.patch', mode: '100644', type: 'blob', sha: 'patch' },
          ],
        }
      : {
          encoding: 'base64',
          content: encodedJson({
            name: '@owner/dsh-client-ui-__NAME__',
            dsh: { bundle: { patch: './plugin.patch' } },
          }),
        })

    const result = await inspectRepository(
      { request } as unknown as ReturnType<typeof createGitHubClient>,
      repository(),
    )

    expect(result).toMatchObject({ status: 'rejected', code: 'scaffold_template', packages: [] })
  })

  it('retries a transient blob failure without re-reading the whole repository', async () => {
    const waiter = vi.fn(async () => undefined)
    let blobAttempts = 0
    const request = vi.fn(async (path: string) => {
      if (path.includes('/git/trees/')) {
        return {
          truncated: false,
          tree: [
            { path: 'package.json', mode: '100644', type: 'blob', sha: 'manifest' },
            { path: 'plugin.patch', mode: '100644', type: 'blob', sha: 'patch' },
          ],
        }
      }
      blobAttempts += 1
      if (blobAttempts === 1) throw new GitHubApiError(502, path, 'Bad gateway', null, null)
      return {
        encoding: 'base64',
        content: encodedJson({ name: '@owner/plugin', dsh: { bundle: { patch: './plugin.patch' } } }),
      }
    })

    const result = await inspectRepository(
      { request } as unknown as ReturnType<typeof createGitHubClient>,
      repository(),
      null,
      60,
      waiter,
    )

    expect(result.packages.map((item) => item.name)).toEqual(['@owner/plugin'])
    expect(blobAttempts).toBe(2)
    // The tree was fetched once: the retry is scoped to the failed blob, so a
    // flaky request costs one request rather than the whole sweep so far.
    expect(request.mock.calls.filter(([path]) => path.includes('/git/trees/'))).toHaveLength(1)
    expect(waiter).toHaveBeenCalledTimes(1)
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
