import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { buildCatalog, findPlugin, parseCatalogQuery } from './lib/catalog'
import { loadCatalogSnapshot } from './lib/catalog-store'
import { fetchPackageDetail } from './lib/github'
import { BUNDLED_REGISTRY } from './lib/registry'
import type {
  BackgroundContext,
  CatalogSnapshotResult,
  PackageDetail,
  RegistryPlugin,
} from './types'

interface AppDependencies {
  catalogLoader: (env: Env, ctx?: BackgroundContext) => Promise<CatalogSnapshotResult>
  detailLoader: (plugin: RegistryPlugin, token?: string) => Promise<PackageDetail>
}

const CACHE_HEADER = 'public, max-age=30, s-maxage=300, stale-while-revalidate=3600'
const SLUG_PART = /^[A-Za-z0-9_.-]+$/

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
    ...overrides,
  }
  const app = new Hono<{ Bindings: Env }>()

  app.use('*', secureHeaders())
  app.use('/api/*', cors({ origin: '*', allowMethods: ['GET', 'HEAD', 'OPTIONS'] }))
  app.use('/plugins.json', cors({ origin: '*', allowMethods: ['GET', 'HEAD', 'OPTIONS'] }))

  app.get('/plugins.json', (context) => {
    context.header('Cache-Control', 'public, max-age=300, s-maxage=3600')
    return context.json(BUNDLED_REGISTRY)
  })

  app.get('/packages', (context) => {
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
      service: 'dsh-store',
      runtime: 'cloudflare-workers',
    }),
  )

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
    const detail = await dependencies.detailLoader(plugin, token)
    context.header('Cache-Control', CACHE_HEADER)
    context.header('X-Catalog-Source', snapshot.source)
    return context.json(detail)
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
