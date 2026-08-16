import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { registerAuthRoutes } from './auth-api'
import { ANONYMOUS_QUOTA, AUTHENTICATED_QUOTA, consumeQuota } from './lib/api-quota'
import { authenticateApiKey, sha256Hex, timingSafeEqualStrings } from './lib/auth'
import {
  buildCatalog,
  filterCatalogPackages,
  findPlugin,
  parseCatalogQuery,
  repositoryName,
} from './lib/catalog'
import { syncCuratedEntries, type CuratedCatalogEntry } from './lib/catalog-db'
import { loadCatalogSnapshot, refreshCatalogSnapshot } from './lib/catalog-store'
import { categoryDescriptor, isKnownCategoryId, projectCategories } from './lib/categories'
import { fetchPackageDetail } from './lib/github'
import {
  emptyInstallMetrics,
  hashInstallationClient,
  InstallationRateLimitError,
  loadPluginInstallStats,
  parseInstallationEvent,
  recordInstallationEvent,
} from './lib/install-metrics'
import { buildLlmsFullTxt, buildRobotsTxt, buildSitemap, seoCatalog } from './seo'
import type {
  BackgroundContext,
  CatalogSnapshotResult,
  PackageDetail,
  RegistryPlugin,
  RegistryProjection,
} from './types'

interface AppDependencies {
  catalogLoader: (env: Env, ctx?: BackgroundContext) => Promise<CatalogSnapshotResult>
  detailLoader: (plugin: RegistryPlugin, token?: string) => Promise<PackageDetail>
  eventRecorder: typeof recordInstallationEvent
  installStatsLoader: typeof loadPluginInstallStats
  curatedSyncer: typeof syncCuratedEntries
  snapshotRefresher: (env: Env, fetcher?: typeof fetch, capturedAt?: number) => Promise<CatalogSnapshotResult>
  clock: () => number
  oauthFetcher: typeof fetch
}

const CACHE_HEADER = 'public, max-age=30, s-maxage=300, stale-while-revalidate=3600'
// The catalog listing is a snapshot projection that only moves when the KV
// snapshot does; the detail endpoint carries live install counters and keeps
// the shorter TTL above.
const LIST_CACHE_HEADER = 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600'
const REGISTRY_CACHE_HEADER = 'public, max-age=300, s-maxage=3600'
const DEFAULT_SEARCH_LIMIT = 20
const MAX_SEARCH_LIMIT = 100
const MAX_SEARCH_PAGE = 1_000_000
const MAX_INSTALL_EVENT_BYTES = 8 * 1024
const MAX_CATALOG_SYNC_BYTES = 2 * 1024 * 1024
const SLUG_PART = /^[A-Za-z0-9_.-]+$/
const ENTRY_ID = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const ENTRY_DATE = /^\d{4}-\d{2}-\d{2}$/
const ENTRY_KEYS = new Set(['id', 'name', 'repository', 'category', 'description', 'added'])

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

function boundedPositiveInt(value: string | undefined, fallback: number, maximum: number): number {
  if (!value || !/^\d+$/.test(value)) return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback
  return Math.min(parsed, maximum)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function boundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength
}

function isCanonicalGitHubRepositoryUrl(repositoryId: string, value: string): boolean {
  try {
    const url = new URL(value)
    const pathname = url.pathname.replace(/\/$/, '')
    return url.protocol === 'https:' &&
      url.hostname.toLocaleLowerCase('en-US') === 'github.com' &&
      url.port === '' &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === '' &&
      pathname.toLocaleLowerCase('en-US') === `/${repositoryId.toLocaleLowerCase('en-US')}`
  } catch {
    return false
  }
}

type CatalogSyncParseResult =
  | { ok: true; entries: CuratedCatalogEntry[] }
  | { ok: false; error: string }

function parseCuratedEntry(value: unknown, index: number): CuratedCatalogEntry | string {
  if (!isObject(value)) return `Entry ${index} must be a JSON object.`
  const unexpected = Object.keys(value).find((key) => !ENTRY_KEYS.has(key))
  if (unexpected) return `Entry ${index} has an unexpected field: ${unexpected}.`
  if (!boundedString(value.id, 201) || !ENTRY_ID.test(value.id)) {
    return `Entry ${index} has an invalid id.`
  }
  if (!boundedString(value.name, 200)) return `Entry ${index} has an invalid name.`
  if (!boundedString(value.repository, 300) ||
    !isCanonicalGitHubRepositoryUrl(value.id, value.repository)) {
    return `Entry ${index} has an invalid repository URL.`
  }
  if (!boundedString(value.category, 40) || !isKnownCategoryId(value.category)) {
    return `Entry ${index} has an unknown category.`
  }
  const description = value.description
  if (!isObject(description) || !boundedString(description.en, 2000) || !boundedString(description.zh, 2000)) {
    return `Entry ${index} has an invalid description.`
  }
  if (!boundedString(value.added, 10) || !ENTRY_DATE.test(value.added)) {
    return `Entry ${index} has an invalid added date.`
  }
  return {
    id: value.id,
    name: value.name,
    repository: value.repository,
    category: value.category,
    description: { en: description.en, zh: description.zh },
    added: value.added,
  }
}

function parseCatalogSyncRequest(value: unknown): CatalogSyncParseResult {
  if (!isObject(value)) return { ok: false, error: 'Request body must be a JSON object.' }
  if (value.source !== 'github_ci') return { ok: false, error: 'Invalid source.' }
  const unexpected = Object.keys(value).find((key) => key !== 'source' && key !== 'entries')
  if (unexpected) return { ok: false, error: `Unexpected field: ${unexpected}.` }
  if (!Array.isArray(value.entries) || value.entries.length === 0) {
    return { ok: false, error: 'entries must be a non-empty array.' }
  }
  const entries: CuratedCatalogEntry[] = []
  const seen = new Set<string>()
  for (const [index, item] of value.entries.entries()) {
    const parsed = parseCuratedEntry(item, index)
    if (typeof parsed === 'string') return { ok: false, error: parsed }
    const normalizedId = parsed.id.toLocaleLowerCase('en-US')
    if (seen.has(normalizedId)) return { ok: false, error: `Entry ${index} duplicates id ${parsed.id}.` }
    seen.add(normalizedId)
    entries.push(parsed)
  }
  return { ok: true, entries }
}

export function createApp(overrides: Partial<AppDependencies> = {}) {
  const dependencies: AppDependencies = {
    catalogLoader: loadCatalogSnapshot,
    detailLoader: fetchPackageDetail,
    eventRecorder: recordInstallationEvent,
    installStatsLoader: loadPluginInstallStats,
    curatedSyncer: syncCuratedEntries,
    snapshotRefresher: refreshCatalogSnapshot,
    clock: Date.now,
    oauthFetcher: (input, init) => fetch(input, init),
    ...overrides,
  }
  const app = new Hono<{ Bindings: Env }>()

  app.use('*', secureHeaders())
  app.use('/api/*', cors({
    origin: '*',
    allowMethods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }))

  app.get('/robots.txt', (context) => {
    context.header('Cache-Control', 'public, max-age=3600, s-maxage=86400')
    return context.text(buildRobotsTxt())
  })

  app.get('/sitemap.xml', async (context) => {
    const result = await dependencies.catalogLoader(
      context.env,
      executionContext(context),
    )
    if (result.source === 'empty') {
      // Publishing a 3-URL sitemap during an outage would tell crawlers the
      // catalog shrank by 2,900 pages, and the edge would cache that for a day.
      context.header('Cache-Control', 'no-store')
      return context.text('Catalog temporarily unavailable.', 503)
    }
    context.header('Cache-Control', 'public, max-age=3600, s-maxage=86400')
    context.header('Content-Type', 'application/xml; charset=UTF-8')
    return context.body(buildSitemap(seoCatalog(result.snapshot)))
  })

  app.get('/llms-full.txt', async (context) => {
    const result = await dependencies.catalogLoader(
      context.env,
      executionContext(context),
    )
    if (result.source === 'empty') {
      context.header('Cache-Control', 'no-store')
      return context.text('Catalog temporarily unavailable.', 503)
    }
    context.header('Cache-Control', 'public, max-age=3600, s-maxage=86400')
    context.header('Content-Type', 'text/plain; charset=UTF-8')
    return context.body(buildLlmsFullTxt(seoCatalog(result.snapshot)))
  })

  app.get('/rankings', (context) => {
    // Nothing links to /rankings and it renders the same view as `/`; a 301
    // keeps the duplicate out of the index instead of relying on a canonical.
    const canonicalUrl = new URL(context.req.url)
    canonicalUrl.pathname = '/'
    return context.redirect(canonicalUrl.toString(), 301)
  })

  app.get('/plugin', (context) => {
    const canonicalUrl = new URL(context.req.url)
    canonicalUrl.pathname = '/plugins'
    return context.redirect(canonicalUrl.toString(), 301)
  })

  app.get('/plugin/', (context) => {
    const canonicalUrl = new URL(context.req.url)
    canonicalUrl.pathname = '/plugins'
    return context.redirect(canonicalUrl.toString(), 301)
  })

  app.get('/plugin/:owner/:name', (context) => {
    const owner = context.req.param('owner')
    const name = context.req.param('name')
    const canonicalUrl = new URL(context.req.url)
    canonicalUrl.pathname = `/plugins/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`
    return context.redirect(canonicalUrl.toString(), 301)
  })

  app.get('/plugin/:owner/:name/', (context) => {
    const owner = context.req.param('owner')
    const name = context.req.param('name')
    const canonicalUrl = new URL(context.req.url)
    canonicalUrl.pathname = `/plugins/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`
    return context.redirect(canonicalUrl.toString(), 301)
  })

  app.get('/packages', (context) => {
    const canonicalUrl = new URL(context.req.url)
    canonicalUrl.pathname = '/plugins'
    return context.redirect(canonicalUrl.toString(), 301)
  })

  app.get('/packages/', (context) => {
    const canonicalUrl = new URL(context.req.url)
    canonicalUrl.pathname = '/plugins'
    return context.redirect(canonicalUrl.toString(), 301)
  })

  app.get('/packages/:owner/:name', (context) => {
    const owner = context.req.param('owner')
    const name = context.req.param('name')
    const canonicalUrl = new URL(context.req.url)
    canonicalUrl.pathname = `/plugins/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`
    return context.redirect(canonicalUrl.toString(), 301)
  })

  app.get('/packages/:owner/:name/', (context) => {
    const owner = context.req.param('owner')
    const name = context.req.param('name')
    const canonicalUrl = new URL(context.req.url)
    canonicalUrl.pathname = `/plugins/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`
    return context.redirect(canonicalUrl.toString(), 301)
  })

  app.get('/api/v1/health', (context) => context.json({ status: 'ok' }))

  app.get('/api/v1/plugins', async (context) => {
    const snapshot = await dependencies.catalogLoader(
      context.env,
      executionContext(context),
    )
    const result = buildCatalog(snapshot, parseCatalogQuery(context.req.query()))
    context.header('Cache-Control', LIST_CACHE_HEADER)
    context.header('X-Catalog-Source', snapshot.source)
    // Crawlable so the SPA can be rendered, but the JSON itself must never be
    // indexed as a page in its own right.
    context.header('X-Robots-Tag', 'noindex')
    return context.json(result)
  })

  app.get('/api/v1/plugins/search', async (context) => {
    context.header('Cache-Control', 'no-store')
    if (!context.env?.CATALOG_DB) {
      return context.json({ error: 'Search is temporarily unavailable.', code: 'SERVICE_UNAVAILABLE' }, 503)
    }

    const q = (context.req.query('q') ?? '').trim().slice(0, 120)
    if (!q) {
      return context.json({ error: 'Missing required query parameter "q".', code: 'MISSING_QUERY' }, 400)
    }
    const category = (context.req.query('category') ?? '').trim().slice(0, 40)
    if (category && !isKnownCategoryId(category)) {
      return context.json({ error: `Unknown category "${category}".`, code: 'INVALID_CATEGORY' }, 400)
    }
    const requestedSort = context.req.query('sortBy') ?? ''
    const sort = parseCatalogQuery({ sort: requestedSort === 'recent' ? 'newest' : requestedSort }).sort
    const page = boundedPositiveInt(context.req.query('page'), 1, MAX_SEARCH_PAGE)
    const limit = boundedPositiveInt(context.req.query('limit'), DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT)

    const authorization = context.req.header('Authorization') ?? ''
    let limits = ANONYMOUS_QUOTA
    let counterKey: string
    if (authorization) {
      const presented = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : ''
      const keyAuth = presented
        ? await authenticateApiKey(context.env.CATALOG_DB, presented, dependencies.clock())
        : null
      if (!keyAuth) {
        return context.json({ error: 'Invalid API key.', code: 'INVALID_API_KEY' }, 401)
      }
      limits = AUTHENTICATED_QUOTA
      // Keyed by account, not key id: rotating or multiplying keys must not
      // mint fresh quota windows.
      counterKey = `user:${keyAuth.userId}`
    } else {
      // The raw client IP never reaches D1: it is keyed through the same HMAC
      // secret the install telemetry uses (plain SHA-256 as a fallback when
      // the secret is not configured, e.g. bare local dev).
      const ip = context.req.header('CF-Connecting-IP')?.trim() || 'unknown'
      const secret = context.env?.INSTALL_CLIENT_HASH_SECRET?.trim()
      counterKey = `ip:${secret ? await hashInstallationClient(secret, ip) : await sha256Hex(ip)}`
    }

    const decision = await consumeQuota(context.env.CATALOG_DB, counterKey, limits, dependencies.clock())
    context.header('X-RateLimit-Daily-Limit', String(decision.dailyLimit))
    context.header('X-RateLimit-Daily-Remaining', String(decision.dailyRemaining))
    if (!decision.allowed) {
      context.header('Retry-After', String(decision.retryAfterSeconds ?? 60))
      if (decision.reason === 'day') {
        return context.json({ error: 'Daily API quota exceeded.', code: 'DAILY_QUOTA_EXCEEDED' }, 429)
      }
      return context.json({ error: 'Too many requests.', code: 'RATE_LIMITED' }, 429)
    }

    const snapshotResult = await dependencies.catalogLoader(
      context.env,
      executionContext(context),
    )
    const filtered = filterCatalogPackages(snapshotResult.snapshot.plugins, { q, category, sort })
    const total = filtered.length
    const start = (page - 1) * limit
    const results = filtered.slice(start, start + limit).map((plugin) => ({
      id: `${plugin.owner}/${plugin.repository}`,
      name: plugin.name,
      owner: plugin.owner,
      url: plugin.url,
      category: plugin.category,
      description: plugin.description,
      stars: plugin.stars,
      installCount: plugin.installCount ?? 0,
      growth24h: plugin.growth24h,
      added: plugin.added,
      pushedAt: plugin.pushedAt,
      install: plugin.install,
    }))
    context.header('X-Catalog-Source', snapshotResult.source)
    return context.json({
      query: q,
      page,
      limit,
      sortBy: sort,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      results,
    })
  })

  app.get('/api/v1/plugins/:owner/:name', async (context) => {
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
    context.header('X-Robots-Tag', 'noindex')
    return context.json({
      ...detail,
      ...installMetrics,
      category: categoryDescriptor(plugin.category),
    })
  })

  app.get('/api/v1/registry', async (context) => {
    const result = await dependencies.catalogLoader(
      context.env,
      executionContext(context),
    )
    const { snapshot } = result
    context.header('Cache-Control', REGISTRY_CACHE_HEADER)
    context.header('X-Catalog-Source', result.source)
    const registry: RegistryProjection = {
      name: 'dsh-1024store-catalog',
      updated: snapshot.generatedAt,
      count: snapshot.plugins.length,
      categories: projectCategories(snapshot.categories),
      plugins: snapshot.plugins.map((plugin) => ({
        id: `${plugin.owner}/${plugin.repository}`,
        name: plugin.name,
        owner: plugin.owner,
        url: plugin.url,
        category: plugin.category,
        description: plugin.description,
        install: `dsh plugin --profile web add github:${plugin.owner}/${plugin.repository}`,
        added: plugin.added,
        stars: plugin.stars,
      })),
    }
    return context.json(registry)
  })

  app.post('/api/v1/catalog/sync', async (context) => {
    const configuredToken = context.env?.CATALOG_SYNC_TOKEN?.trim()
    if (!configuredToken || configuredToken.length < 32 || !context.env?.CATALOG_DB) {
      return context.json({ error: 'Catalog sync is not configured.' }, 503)
    }

    const authorization = context.req.header('Authorization') ?? ''
    const presentedToken = authorization.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length).trim()
      : ''
    if (!timingSafeEqualStrings(configuredToken, presentedToken)) {
      return context.json({ error: 'Invalid catalog sync token.' }, 401)
    }

    const contentType = context.req.header('Content-Type')?.split(';', 1)[0]?.trim().toLocaleLowerCase()
    if (contentType !== 'application/json') {
      return context.json({ error: 'Content-Type must be application/json.' }, 415)
    }
    const rawBody = await readBoundedBody(context.req.raw, MAX_CATALOG_SYNC_BYTES)
    if (rawBody === null) {
      return context.json({ error: 'Request body is too large.' }, 413)
    }
    let value: unknown
    try {
      value = JSON.parse(rawBody)
    } catch {
      return context.json({ error: 'Request body must be valid JSON.' }, 400)
    }
    const parsed = parseCatalogSyncRequest(value)
    if (!parsed.ok) return context.json({ error: parsed.error }, 400)

    const capturedAt = dependencies.clock()
    const result = await dependencies.curatedSyncer(
      context.env.CATALOG_DB,
      parsed.entries,
      new Date(capturedAt).toISOString(),
    )
    await dependencies.snapshotRefresher(context.env, fetch, capturedAt)
    return context.json({
      ok: true,
      total: result.total,
      removedSources: result.removedSources,
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

    const secret = context.env?.INSTALL_CLIENT_HASH_SECRET?.trim()
    if (!secret || secret.length < 32 || !context.env?.CATALOG_DB) {
      return context.json({ error: 'Installation telemetry is temporarily unavailable.' }, 503)
    }

    // Any well-formed event is recorded; the stored plugin id is lowercased in
    // both branches so aggregates recorded before a plugin enters the catalog
    // merge with post-catalog events regardless of the repository's GitHub
    // casing (reads also compare COLLATE NOCASE in install-metrics.ts).
    const [requestedOwner, requestedRepository] = parsed.event.pluginId.split('/') as [string, string]
    const catalog = await dependencies.catalogLoader(
      context.env,
      executionContext(context),
    )
    const plugin = findPlugin(catalog.snapshot.plugins, requestedOwner, requestedRepository)
    const canonicalPluginId = (plugin
      ? `${plugin.owner}/${repositoryName(plugin)}`
      : parsed.event.pluginId).toLocaleLowerCase()

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

  registerAuthRoutes(app, {
    clock: dependencies.clock,
    oauthFetcher: dependencies.oauthFetcher,
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
    return context.json({ error: 'The package catalog is temporarily unavailable.', code: 'INTERNAL_ERROR' }, 500)
  })

  return app
}
