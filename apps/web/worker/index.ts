import { createApp } from './app'
import { runScheduledCatalogRefresh } from './lib/catalog-store'

const STATS_OBJECT_NAME = 'global'
const app = createApp()

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
    if (url.pathname === '/api/live') return handleLiveStats(request, env)
    return app.fetch(request, env, ctx)
  },
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(runScheduledCatalogRefresh(env))
  },
} satisfies ExportedHandler<Env>

export { createApp } from './app'
export { LiveStats } from './live-stats'
export default worker
