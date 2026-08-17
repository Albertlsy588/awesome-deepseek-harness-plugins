import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isCommunityRoute, serveCommunity } from '../../community/worker/serve'

/**
 * The site Worker serves two single-page apps out of one asset directory.
 *
 * That only works because `/community/*` is carved out before the catalog's own
 * SPA fallback runs: the fallback returns the catalog's index.html for any
 * unknown path, so without the carve-out a community permalink would silently
 * boot the wrong application — a 200 with the wrong page, which no smoke test
 * would notice.
 */

const COMMUNITY_SHELL = '<!doctype html><html><head><!--seo-head--></head><body>community</body></html>'
const CATALOG_SHELL = '<!doctype html><html><head></head><body>catalog</body></html>'

interface AssetCall {
  paths: string[]
}

function env(calls: AssetCall, options: { communityShellExists?: boolean } = {}): Env {
  const communityShellExists = options.communityShellExists ?? true
  return {
    CATALOG_DB: {
      prepare: () => ({ bind: () => ({ first: async () => null }) }),
    },
    ASSETS: {
      fetch: async (request: Request) => {
        const { pathname } = new URL(request.url)
        calls.paths.push(pathname)
        if (pathname === '/community/index.html') {
          return communityShellExists
            ? new Response(COMMUNITY_SHELL, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
            : new Response('not found', { status: 404 })
        }
        if (pathname === '/community/assets/index-abc123.js') {
          return new Response('console.log(1)', { headers: { 'Content-Type': 'text/javascript' } })
        }
        // Everything else is the catalog's SPA fallback, which is exactly the
        // behaviour that makes the carve-out necessary.
        return new Response(CATALOG_SHELL, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
      },
    },
  } as unknown as Env
}

async function get(path: string, environment: Env): Promise<Response> {
  const request = new Request(`https://deepseek1024.com${path}`)
  const url = new URL(request.url)
  // What worker/index.ts does with this path.
  if (!isCommunityRoute(url.pathname)) return environment.ASSETS.fetch(request)
  return serveCommunity(request, url, environment)
}

describe('community routing', () => {
  it('serves the community shell for a community path, not the catalog’s', async () => {
    const calls: AssetCall = { paths: [] }
    const response = await get('/community', env(calls))
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(body).toContain('community')
    expect(body).not.toContain('catalog')
    expect(calls.paths).toContain('/community/index.html')
  })

  it('serves the same shell for a deep permalink a reload would hit', async () => {
    const calls: AssetCall = { paths: [] }
    const body = await (await get('/community/p/42', env(calls))).text()
    expect(body).toContain('community')
    expect(body).not.toContain('catalog')
  })

  it('replaces the shell’s marker with real metadata', async () => {
    const body = await (await get('/community/u/octocat', env({ paths: [] }))).text()
    expect(body).not.toContain('<!--seo-head-->')
    expect(body).toContain('<title>')
    expect(body).toContain('noindex,follow')
  })

  it('leaves the catalog on its own paths', async () => {
    const body = await (await get('/plugins', env({ paths: [] }))).text()
    expect(body).toContain('catalog')
  })

  it('does not treat a lookalike prefix as a community path', async () => {
    // `/communityfoo` shares a prefix but is not under the community.
    const body = await (await get('/communityfoo', env({ paths: [] }))).text()
    expect(body).toContain('catalog')
  })

  it('serves community bundles immutably and 404s a miss under assets', async () => {
    const hit = await get('/community/assets/index-abc123.js', env({ paths: [] }))
    expect(hit.status).toBe(200)
    expect(hit.headers.get('Cache-Control')).toContain('immutable')

    // A miss under /assets/ resolves to the SPA fallback document. Serving HTML
    // at a hashed bundle URL, with a year-long cache, poisons the client.
    const miss = await get('/community/assets/index-deleted.js', env({ paths: [] }))
    expect(miss.status).toBe(404)
    expect(miss.headers.get('Cache-Control')).toBe('no-store')
  })

  it('falls through rather than inventing a page when the shell is missing', async () => {
    const response = await get('/community/p/1', env({ paths: [] }, { communityShellExists: false }))
    expect(response.status).toBe(200)
    // The catalog fallback, i.e. the deploy shipped without the community build.
    expect(await response.text()).toContain('catalog')
  })
})

describe('deployed community surface', () => {
  /** Comments are not configuration; only what wrangler would actually read. */
  const declarations = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')

  it('never declares the development sign-in flag', () => {
    // The flag lives only in .dev.vars, which is git-ignored and which
    // `wrangler deploy` does not read. Declaring it here would leave the
    // loopback hostname check as the only thing between a visitor and a session
    // for any login they care to name.
    expect(declarations).not.toContain('COMMUNITY_DEV_LOGIN')
  })

  it('declares the admin list, so deletion by a moderator is configurable', () => {
    expect(declarations).toContain('COMMUNITY_ADMIN_LOGINS')
  })

  it('still binds every hostname it owns', () => {
    // This array is the authoritative binding list, not a patch: deploying with
    // a custom domain missing unbinds it and that hostname starts 522ing.
    const patterns = [...declarations.matchAll(/"pattern":\s*"([^"]+)"/g)].map((match) => match[1])
    expect(patterns).toEqual([
      'deepseek1024.com',
      'www.deepseek1024.com',
      'api.deepseek1024.com',
    ])
  })
})
