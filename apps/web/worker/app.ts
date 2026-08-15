import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import storeManifest from '../../../packages/dsh-1024store/package.json' with { type: 'json' }
import { buildCatalog, findPlugin, parseCatalogQuery, repositoryName } from './lib/catalog'
import { loadCatalogSnapshot } from './lib/catalog-store'
import { fetchPackageDetail } from './lib/github'
import {
  emptyInstallMetrics,
  InstallationRateLimitError,
  loadPluginInstallStats,
  parseInstallationEvent,
  recordInstallationEvent,
} from './lib/install-metrics'
import { buildRobotsTxt, buildSitemap } from './seo'
import type {
  BackgroundContext,
  CatalogSnapshotResult,
  PackageDetail,
  RegistryPlugin,
} from './types'

interface AppDependencies {
  catalogLoader: (env: Env, ctx?: BackgroundContext) => Promise<CatalogSnapshotResult>
  detailLoader: (plugin: RegistryPlugin, token?: string) => Promise<PackageDetail>
  eventRecorder: typeof recordInstallationEvent
  installStatsLoader: typeof loadPluginInstallStats
  clock: () => number
}

const CACHE_HEADER = 'public, max-age=30, s-maxage=300, stale-while-revalidate=3600'
const INSTALL_STATS_CACHE_HEADER = 'public, max-age=15, s-maxage=30, stale-while-revalidate=300'
const MAX_INSTALL_EVENT_BYTES = 8 * 1024
const SLUG_PART = /^[A-Za-z0-9_.-]+$/

async function readBoundedBody(request: Request, maximumBytes: number): Promise<string | null> {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  while (true) {
    const result = await reader.read()
    if (result.done) break
    total += result.value.byteLength
    if (total > maximumBytes) {
      await reader.cancel()
      return null
    }
    chunks.push(result.value)
  }

  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(body)
}

function executionContext(context: { executionCtx: BackgroundContext }): BackgroundContext | undefined {
  try {
    return context.executionCtx
  } catch {
    return undefined
  }
}

export function createApp(overrides: Partial<AppDependencies> = {}) {
  const dependencies: AppDependencies = {
    catalogLoader: loadCatalogSnapshot,
    detailLoader: fetchPackageDetail,
    eventRecorder: recordInstallationEvent,
    installStatsLoader: loadPluginInstallStats,
    clock: Date.now,
    ...overrides,
  }
  const app = new Hono<{ Bindings: Env }>()

  app.use('*', secureHeaders())
  app.use('/api/*', cors({
    origin: '*',
    allowMethods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    maxAge: 86400,
  }))
  app.use('/plugins.json', cors({ origin: '*', allowMethods: ['GET', 'HEAD', 'OPTIONS'] }))

  app.get('/plugins.json', async (context) => {
    const result = await dependencies.catalogLoader(
      context.env,
      executionContext(context),
    )
    const { snapshot } = result
    context.header('Cache-Control', 'public, max-age=300, s-maxage=3600')
    context.header('X-Catalog-Source', result.source)
    return context.json({
      updated: snapshot.registryUpdated,
      count: snapshot.plugins.length,
      revision: snapshot.registryRevision,
      categories: snapshot.categories,
      plugins: snapshot.plugins.map((plugin) => ({
        name: plugin.name,
        owner: plugin.owner,
        url: plugin.url,
        category: plugin.category,
        description: plugin.description,
        install: plugin.install,
        added: plugin.added,
      })),
    })
  })

  app.get('/', (context) => {
    const canonicalUrl = new URL(context.req.url)
    canonicalUrl.pathname = '/rankings'
    return context.redirect(canonicalUrl.toString(), 301)
  })

  app.get('/robots.txt', (context) => {
    context.header('Cache-Control', 'public, max-age=3600, s-maxage=86400')
    return context.text(buildRobotsTxt())
  })

  app.get('/sitemap.xml', (context) => {
    context.header('Cache-Control', 'public, max-age=3600, s-maxage=86400')
    context.header('Content-Type', 'application/xml; charset=UTF-8')
    return context.body(buildSitemap())
  })

  app.get('/packages', (context) => {
    const canonicalUrl = new URL(context.req.url)
    canonicalUrl.pathname = '/plugin'
    return context.redirect(canonicalUrl.toString(), 301)
  })

  app.get('/packages/', (context) => {
    const canonicalUrl = new URL(context.req.url)
    canonicalUrl.pathname = '/plugin'
    return context.redirect(canonicalUrl.toString(), 301)
  })

  app.get('/packages/:owner/:name', (context) => {
    const owner = context.req.param('owner')
    const name = context.req.param('name')
    const canonicalUrl = new URL(context.req.url)
    canonicalUrl.pathname = `/plugin/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`
    return context.redirect(canonicalUrl.toString(), 301)
  })

  app.get('/api/packages', (context) => {
    const canonicalUrl = new URL(context.req.url)
    canonicalUrl.pathname = '/api/plugin'
    return context.redirect(canonicalUrl.toString(), 301)
  })

  app.get('/api/packages/:owner/:name', (context) => {
    const owner = context.req.param('owner')
    const name = context.req.param('name')
    const canonicalUrl = new URL(context.req.url)
    canonicalUrl.pathname = `/api/plugin/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`
    return context.redirect(canonicalUrl.toString(), 301)
  })

  app.get('/api/health', (context) =>
    context.json({
      ok: true,
      service: 'dsh-1024store',
      runtime: 'cloudflare-workers',
    }),
  )

  app.get('/api/dsh-1024store', (context) => {
    context.header('Cache-Control', 'public, max-age=300, s-maxage=3600')
    return context.json({
      name: storeManifest.name,
      version: storeManifest.version,
      releaseUrl: 'https://github.com/imsai-sh/awesome-deepseek-harness-plugins/tree/main/packages/dsh-1024store',
    })
  })

  app.post('/api/v1/install-events', async (context) => {
    const contentType = context.req.header('Content-Type')?.split(';', 1)[0]?.trim().toLocaleLowerCase()
    if (contentType !== 'application/json') {
      return context.json({ error: 'Content-Type must be application/json.' }, 415)
    }

    const declaredLength = context.req.header('Content-Length')
    if (declaredLength) {
      if (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_INSTALL_EVENT_BYTES) {
        return context.json({ error: 'Request body is too large.' }, 413)
      }
    }

    const rawBody = await readBoundedBody(context.req.raw, MAX_INSTALL_EVENT_BYTES)
    if (rawBody === null) {
      return context.json({ error: 'Request body is too large.' }, 413)
    }

    let value: unknown
    try {
      value = JSON.parse(rawBody)
    } catch {
      return context.json({ error: 'Request body must be valid JSON.' }, 400)
    }
    const parsed = parseInstallationEvent(value)
    if (!parsed.ok) return context.json({ error: parsed.error }, 400)

    const [requestedOwner, requestedRepository] = parsed.event.pluginId.split('/') as [string, string]
    const catalog = await dependencies.catalogLoader(
      context.env,
      executionContext(context),
    )
    const plugin = findPlugin(catalog.snapshot.plugins, requestedOwner, requestedRepository)
    if (!plugin) return context.json({ error: 'Package not found.' }, 404)

    const secret = context.env?.INSTALL_CLIENT_HASH_SECRET?.trim()
    if (!secret || secret.length < 32 || !context.env?.CATALOG_DB) {
      return context.json({ error: 'Installation telemetry is temporarily unavailable.' }, 503)
    }
    const canonicalPluginId = `${plugin.owner}/${repositoryName(plugin)}`

    try {
      const recorded = await dependencies.eventRecorder(
        context.env.CATALOG_DB,
        secret,
        parsed.event,
        canonicalPluginId,
        dependencies.clock(),
      )
      return context.json({
        accepted: true,
        duplicate: recorded.duplicate,
        eventId: recorded.eventId,
        pluginId: recorded.pluginId,
        serverReceivedAt: recorded.serverReceivedAt,
      }, recorded.duplicate ? 200 : 202)
    } catch (error) {
      if (error instanceof InstallationRateLimitError) {
        context.header('Retry-After', String(error.retryAfterSeconds))
        return context.json({ error: 'Too many installation events.' }, 429)
      }
      throw error
    }
  })

  app.get('/api/plugin', async (context) => {
    const snapshot = await dependencies.catalogLoader(
      context.env,
      executionContext(context),
    )
    const result = buildCatalog(snapshot, parseCatalogQuery(context.req.query()))
    context.header('Cache-Control', CACHE_HEADER)
    context.header('X-Catalog-Source', snapshot.source)
    return context.json(result)
  })

  app.get('/api/plugin/:owner/:name', async (context) => {
    const owner = context.req.param('owner')
    const name = context.req.param('name')
    if (!SLUG_PART.test(owner) || !SLUG_PART.test(name)) {
      return context.json({ error: 'Invalid package identifier.' }, 400)
    }

    const snapshot = await dependencies.catalogLoader(
      context.env,
      executionContext(context),
    )
    const plugin = findPlugin(snapshot.snapshot.plugins, owner, name)
    if (!plugin) return context.json({ error: 'Package not found.' }, 404)

    const token = context.env?.GITHUB_TOKEN?.trim() || undefined
    const canonicalPluginId = `${plugin.owner}/${repositoryName(plugin)}`
    const [detail, installMetrics] = await Promise.all([
      dependencies.detailLoader(plugin, token),
      context.env?.CATALOG_DB
        ? dependencies.installStatsLoader(
            context.env.CATALOG_DB,
            canonicalPluginId,
            dependencies.clock(),
          ).catch((error) => {
            console.error(JSON.stringify({
              message: 'package_install_metrics_failed',
              pluginId: canonicalPluginId,
              error: error instanceof Error ? error.message : String(error),
            }))
            return emptyInstallMetrics()
          })
        : Promise.resolve(emptyInstallMetrics()),
    ])
    context.header('Cache-Control', CACHE_HEADER)
    context.header('X-Catalog-Source', snapshot.source)
    return context.json({ ...detail, ...installMetrics })
  })

  app.get('/api/install-stats/:owner/:name', async (context) => {
    const owner = context.req.param('owner')
    const name = context.req.param('name')
    if (!SLUG_PART.test(owner) || !SLUG_PART.test(name)) {
      return context.json({ error: 'Invalid package identifier.' }, 400)
    }

    const snapshot = await dependencies.catalogLoader(
      context.env,
      executionContext(context),
    )
    const plugin = findPlugin(snapshot.snapshot.plugins, owner, name)
    if (!plugin) return context.json({ error: 'Package not found.' }, 404)
    if (!context.env?.CATALOG_DB) {
      return context.json({ error: 'Installation statistics are temporarily unavailable.' }, 503)
    }

    const generatedAt = dependencies.clock()
    const pluginId = `${plugin.owner}/${repositoryName(plugin)}`
    const metrics = await dependencies.installStatsLoader(
      context.env.CATALOG_DB,
      pluginId,
      generatedAt,
    )
    context.header('Cache-Control', INSTALL_STATS_CACHE_HEADER)
    context.header('X-Catalog-Source', snapshot.source)
    return context.json({
      pluginId,
      ...metrics,
      generatedAt: new Date(generatedAt).toISOString(),
    })
  })

  app.notFound((context) => context.json({ error: 'API route not found.' }, 404))
  app.onError((error, context) => {
    console.error(
      JSON.stringify({
        message: 'request_failed',
        path: context.req.path,
        error: error.message,
      }),
    )
    return context.json({ error: 'The package catalog is temporarily unavailable.' }, 500)
  })

  return app
}
