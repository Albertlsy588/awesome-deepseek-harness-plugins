import { createApp } from './app'
import { runScheduledCatalogRefresh } from './lib/catalog-store'
import { runPluginDiscoveryTask } from './lib/plugin-discovery-task'

const STATS_OBJECT_NAME = 'global'
const INCREMENTAL_DISCOVERY_CRONS = new Set(['7 * * * *', '37 * * * *'])
const FULL_DISCOVERY_CRON = '17 3 * * SUN'
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
  scheduled(controller, env, ctx) {
    if (controller.cron === FULL_DISCOVERY_CRON) {
      ctx.waitUntil(runPluginDiscoveryTask(env, 'full', controller.scheduledTime).then(logDiscovery))
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
