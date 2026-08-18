import { isPublicApiHost, rewritePublicApiUrl } from '../public-api'

// Only these two `/api/` paths may be answered from a POP's own cache. An
// allowlist rather than a denylist: `/api/live` is a WebSocket, the community
// and auth routes are per-user, and search is deliberately `no-store` — none of
// them may ever be served to the wrong caller because a path was forgotten here.
const CACHEABLE_API_PATHS = new Set(['/api/v1/plugins', '/api/v1/registry'])

export function edgeCacheablePath(pathname: string): boolean {
  if (pathname.startsWith('/api/')) return CACHEABLE_API_PATHS.has(pathname)
  // Hashed bundles are already immutable to the browser, and a miss here is the
  // SPA fallback document rather than an asset.
  if (pathname.startsWith('/assets/')) return false
  return true
}

/**
 * A POP-local cache in front of the Worker.
 *
 * A Worker's response to the eyeball is not cached by Cloudflare on its own —
 * `Cache-Control: s-maxage` on the way out is a statement about the response,
 * not an instruction anyone executes, and a Cache Rule in the dashboard cannot
 * step in either because `run_worker_first` puts this Worker ahead of the cache.
 * So the entire catalog was being read out of KV and re-serialized once per
 * request. Filling `caches.default` explicitly collapses that to once per POP
 * per `s-maxage`.
 *
 * The key is the request URL. Every cacheable response here is a function of
 * the URL alone: the catalog endpoints take no credentials, and the HTML is the
 * SPA shell with SEO metadata rewritten into it — sign-in state arrives later
 * from `/api/v1/auth/me`, so no cookie can change what is stored.
 */
export function edgeCacheKey(url: URL): Request | null {
  const pathname = isPublicApiHost(url) ? rewritePublicApiUrl(url)?.pathname : url.pathname
  if (pathname === undefined || !edgeCacheablePath(pathname)) return null
  return new Request(url.toString(), { method: 'GET' })
}

// A redirect, a 404 or anything carrying a cookie stays out; `cache.put` honours
// the response's own Cache-Control for how long the copy lives.
export function isStorable(response: Response): boolean {
  return response.status === 200 && !response.headers.has('Set-Cookie')
}

/** Makes hit rate observable without reaching for analytics. */
export function tagged(response: Response, state: 'hit' | 'miss'): Response {
  const headers = new Headers(response.headers)
  headers.set('X-Edge-Cache', state)
  return new Response(response.body, { status: response.status, headers })
}
