import { createApp } from './app'
import { cleanupExpiredAuthRows } from './lib/auth'
import { loadCatalogSnapshot, runScheduledCatalogRefresh } from './lib/catalog-store'
import { runPluginDiscoveryTask } from './lib/plugin-discovery-task'
import { isPublicApiHost, publicApiNotFound, rewritePublicApiUrl, wwwRedirect } from './public-api'
import { metadataForPath, rewriteHtmlResponse, seoCatalog } from './seo'

const STATS_OBJECT_NAME = 'global'
const INCREMENTAL_DISCOVERY_CRONS = new Set(['7 * * * *', '37 * * * *'])
const FULL_DISCOVERY_CRON = '17 3 * * SUN'
const app = createApp()

function isWorkerRoute(pathname: string): boolean {
  return pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname === '/plugin' ||
    pathname.startsWith('/plugin/') ||
    pathname === '/packages' ||
    pathname.startsWith('/packages/') ||
    pathname.startsWith('/api/')
}

function isFilteredCollection(url: URL): boolean {
  if (url.pathname !== '/' && url.pathname !== '/plugins' && url.pathname !== '/rankings') return false
  return url.searchParams.has('q') ||
    url.searchParams.has('category') ||
    url.searchParams.has('sort')
}

function canonicalTrailingSlashRedirect(url: URL): Response | null {
  const shouldRedirect = url.pathname === '/plugins/' ||
    url.pathname === '/rankings/' ||
    /^\/plugins\/[^/]+\/[^/]+\/$/.test(url.pathname)
  if (!shouldRedirect) return null
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
      if (!response.headers.get('Content-Type')?.includes('text/html')) return response
      // Fresh KV resolves immediately; stale KV answers now and refreshes via
      // ctx.waitUntil, so SSR metadata never blocks on a full catalog rebuild.
      const catalog = await loadCatalogSnapshot(env, ctx)
      const metadata = metadataForPath(url.pathname, seoCatalog(catalog.snapshot))
      if (isFilteredCollection(url)) metadata.robots = 'noindex,follow'
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
