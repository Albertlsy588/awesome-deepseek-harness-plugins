import { createApp } from './app'
import { cleanupExpiredAuthRows } from './lib/auth'
import { loadCatalogSnapshot, runScheduledCatalogRefresh } from './lib/catalog-store'
import { runPluginDiscoveryTask } from './lib/plugin-discovery-task'
import { isPublicApiHost, publicApiNotFound, rewritePublicApiUrl, wwwRedirect } from './public-api'
import { collectionQueryKind, metadataForPath, rewriteHtmlResponse, seoCatalog } from './seo'

const STATS_OBJECT_NAME = 'global'
const INCREMENTAL_DISCOVERY_CRONS = new Set(['7 * * * *', '37 * * * *'])
const FULL_DISCOVERY_CRON = '17 3 * * SUN'
const app = createApp()

function isWorkerRoute(pathname: string): boolean {
  return pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname === '/llms-full.txt' ||
    pathname === '/rankings' ||
    pathname === '/plugin' ||
    pathname.startsWith('/plugin/') ||
    pathname === '/packages' ||
    pathname.startsWith('/packages/') ||
    pathname.startsWith('/api/')
}

function canonicalTrailingSlashRedirect(url: URL): Response | null {
  if (url.pathname === '/' || !url.pathname.endsWith('/')) return null
  // This runs before isWorkerRoute, so API paths have to be excluded or a POST
  // to /api/v1/install-events/ would be answered with a redirect.
  if (url.pathname.startsWith('/api/')) return null
  if (url.pathname.startsWith('/plugin/') || url.pathname.startsWith('/packages/')) return null
  const canonical = new URL(url)
  canonical.pathname = canonical.pathname.slice(0, -1)
  return Response.redirect(canonical.toString(), 301)
}

async function handleLiveStats(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') {
    return Response.json({ error: 'Method not allowed.' }, { status: 405 })
  }
  if (request.headers.get('Upgrade')?.toLocaleLowerCase() !== 'websocket') {
    return Response.json({ error: 'Expected a WebSocket upgrade.' }, { status: 426 })
  }
  return env.LIVE_STATS.getByName(STATS_OBJECT_NAME).fetch(request)
}

const worker = {
  fetch(request, env, ctx) {
    const url = new URL(request.url)
    const canonicalHostRedirect = wwwRedirect(url)
    if (canonicalHostRedirect) return canonicalHostRedirect
    if (isPublicApiHost(url)) {
      const rewritten = rewritePublicApiUrl(url)
      if (!rewritten) return publicApiNotFound(url.pathname)
      return app.fetch(new Request(rewritten.toString(), request), env, ctx)
    }
    if (url.pathname === '/api/live') return handleLiveStats(request, env)
    const trailingSlashRedirect = canonicalTrailingSlashRedirect(url)
    if (trailingSlashRedirect) return trailingSlashRedirect
    if (isWorkerRoute(url.pathname)) return app.fetch(request, env, ctx)

    return env.ASSETS.fetch(request).then(async (response) => {
      const isHtml = Boolean(response.headers.get('Content-Type')?.includes('text/html'))
      // Vite fingerprints everything under /assets/, so revalidating it on every
      // navigation is pure latency. Unhashed files in public/ keep the short TTL.
      // A miss under /assets/ is the SPA fallback document, not an asset:
      // marking that immutable would pin a text/html body at a hashed chunk URL
      // for a year, and content hashing can re-mint that exact filename later.
      if (url.pathname.startsWith('/assets/')) {
        if (response.status === 200 && !isHtml) {
          const headers = new Headers(response.headers)
          headers.set('Cache-Control', 'public, max-age=31536000, immutable')
          return new Response(response.body, { status: response.status, headers })
        }
        return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } })
      }
      if (!isHtml) return response
      // Fresh KV resolves immediately; stale KV answers now and refreshes via
      // ctx.waitUntil, so SSR metadata never blocks on a full catalog rebuild.
      const catalog = await loadCatalogSnapshot(env, ctx)
      const metadata = metadataForPath(
        url.pathname,
        seoCatalog(catalog.snapshot, catalog.source === 'empty'),
      )
      if (collectionQueryKind(url) === 'filtered') {
        metadata.robots = 'noindex,follow'
        // A noindexed permutation pointing its canonical at the unfiltered page
        // is a conflicting pair of signals; no canonical is the cleaner one.
        metadata.canonical = null
      }
      return rewriteHtmlResponse(response, metadata)
    })
  },
  scheduled(controller, env, ctx) {
    if (controller.cron === FULL_DISCOVERY_CRON) {
      ctx.waitUntil(runPluginDiscoveryTask(env, 'full', controller.scheduledTime).then(logDiscovery))
      ctx.waitUntil(cleanupExpiredAuthRows(env.CATALOG_DB, controller.scheduledTime).catch((error) => {
        console.error(JSON.stringify({
          message: 'auth_cleanup_failed',
          error: error instanceof Error ? error.message : String(error),
        }))
      }))
      return
    }
    if (INCREMENTAL_DISCOVERY_CRONS.has(controller.cron)) {
      ctx.waitUntil(runPluginDiscoveryTask(env, undefined, controller.scheduledTime).then(logDiscovery))
      return
    }
    ctx.waitUntil(runScheduledCatalogRefresh(env, controller.scheduledTime))
  },
} satisfies ExportedHandler<Env>

export { createApp } from './app'
export { LiveStats } from './live-stats'
export default worker

function logDiscovery(result: Awaited<ReturnType<typeof runPluginDiscoveryTask>>): void {
  console.log(JSON.stringify({ message: 'plugin_discovery_completed', ...result }))
}
