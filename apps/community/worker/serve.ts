import { COMMUNITY_BASE_PATH } from './app'
import { renderCommunityShell } from './share-metadata'

export function isCommunityRoute(pathname: string): boolean {
  return pathname === COMMUNITY_BASE_PATH || pathname.startsWith(`${COMMUNITY_BASE_PATH}/`)
}

/**
 * Serve the community's own single-page app.
 *
 * It is built separately, with `base: '/community/'`, into this Worker's asset
 * directory, so its hashed bundles resolve without a rule here. What does need a
 * rule is the fallback: the site's SPA fallback returns the *catalog's*
 * index.html for an unknown path, which would hand a community URL the wrong
 * application. Anything under this prefix that is not a file falls back to the
 * community's own shell instead, and only then gets its share metadata.
 */
export async function serveCommunity(request: Request, url: URL, env: Env): Promise<Response> {
  const direct = await env.ASSETS.fetch(request)
  const isHtml = Boolean(direct.headers.get('Content-Type')?.includes('text/html'))

  if (url.pathname.startsWith(`${COMMUNITY_BASE_PATH}/assets/`)) {
    if (direct.status === 200 && !isHtml) {
      const headers = new Headers(direct.headers)
      headers.set('Cache-Control', 'public, max-age=31536000, immutable')
      return new Response(direct.body, { status: direct.status, headers })
    }
    // A miss under /assets/ is the SPA fallback document, not an asset.
    return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }
  if (direct.status === 200 && !isHtml) return direct

  const shell = await env.ASSETS.fetch(
    new Request(`${url.origin}${COMMUNITY_BASE_PATH}/index.html`, { headers: request.headers }),
  )
  if (!shell.ok) return direct
  return renderCommunityShell(shell, url, env)
}
