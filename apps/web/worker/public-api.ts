import { buildApiHostRobotsTxt, SITE_ORIGIN } from './seo'

/**
 * Public developer-API host. Only the search API (and its health probe) is
 * exposed here, under the shorter /v1/ prefix; everything else on this host
 * is a 404. Sign-in, key management, and the website stay on the main site.
 */
export const PUBLIC_API_HOST = 'api.deepseek1024.com'

const PUBLIC_API_PATHS: Record<string, string> = {
  '/v1/plugins/search': '/api/v1/plugins/search',
  '/v1/health': '/api/v1/health',
}

export function isPublicApiHost(url: URL): boolean {
  return url.hostname === PUBLIC_API_HOST
}

/**
 * Maps a public-API-host URL onto the worker's internal route, or null when
 * the path is not part of the public surface.
 */
export function rewritePublicApiUrl(url: URL): URL | null {
  const internalPath = PUBLIC_API_PATHS[url.pathname]
  if (!internalPath) return null
  const rewritten = new URL(url)
  rewritten.pathname = internalPath
  return rewritten
}

export function publicApiNotFound(pathname: string): Response {
  if (pathname === '/') {
    return Response.redirect(`${SITE_ORIGIN}/docs/api`, 302)
  }
  // The API host has no indexable surface; without this it inherits whatever
  // the zone serves and can end up competing with the documentation page.
  if (pathname === '/robots.txt') {
    return new Response(buildApiHostRobotsTxt(), {
      headers: {
        'Content-Type': 'text/plain; charset=UTF-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      },
    })
  }
  return Response.json({ error: 'API route not found.', code: 'NOT_FOUND' }, { status: 404 })
}
