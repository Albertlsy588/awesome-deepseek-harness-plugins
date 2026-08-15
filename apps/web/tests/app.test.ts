import { describe, expect, it, vi } from 'vitest'
import storeManifest from '../../../packages/dsh-1024store/package.json' with { type: 'json' }
import { createApp } from '../worker/app'
import {
  emptyInstallMetrics,
  InstallationRateLimitError,
  type InstallationEvent,
} from '../worker/lib/install-metrics'
import type { PackageDetail } from '../worker/types'
import { TEST_PLUGINS, testCatalogResult } from './fixtures'

function testApp() {
  const detail = {
    ...TEST_PLUGINS[0],
    github: null,
    manifest: null,
    readme: null,
    verification: { repositoryReachable: false, bundleDeclared: false },
  } satisfies PackageDetail

  return createApp({
    catalogLoader: vi.fn(async () => testCatalogResult()),
    detailLoader: vi.fn(async () => detail),
  })
}

const VALID_INSTALL_EVENT = {
  eventId: 'b8247a4e-3f87-4ebf-8a78-6a5a33f03648',
  clientId: 'd2b0d8a3-c636-4f34-b16f-2eb4f5f39965',
  pluginId: 'openma-ai/deepseek-harness-tui',
  profile: 'web',
  operation: 'install',
  status: 'success',
  clientStartedAt: '2026-08-14T12:00:00.000Z',
  clientCompletedAt: '2026-08-14T12:00:01.250Z',
  durationMs: 1250,
  beforeVersion: null,
  afterVersion: '1.2.3',
  requestedRef: 'github:openma-ai/deepseek-harness-tui',
  cliVersion: '0.1.0',
  dshVersion: '0.1.0-rc.5',
  platform: 'darwin',
  arch: 'arm64',
  isCi: false,
  errorCode: null,
  sourceChannel: 'cli',
}

const TELEMETRY_ENV = {
  CATALOG_DB: {},
  INSTALL_CLIENT_HASH_SECRET: 'test-install-secret-that-is-at-least-32-bytes',
} as unknown as Env

function telemetryApp(outcome: boolean | 'rate-limit' = false) {
  const eventRecorder = vi.fn(async (
    _db: D1Database,
    _secret: string,
    event: InstallationEvent,
    pluginId: string,
    receivedAt: number = Date.now(),
  ) => {
    if (outcome === 'rate-limit') throw new InstallationRateLimitError(30)
    return {
      duplicate: outcome,
      eventId: event.eventId,
      pluginId,
      serverReceivedAt: new Date(receivedAt).toISOString(),
    }
  })
  const app = createApp({
    catalogLoader: vi.fn(async () => testCatalogResult()),
    eventRecorder,
    clock: () => Date.parse('2026-08-14T12:05:00Z'),
  })
  return { app, eventRecorder }
}

describe('market API', () => {
  it('publishes crawl controls and redirects the root to the canonical rankings page', async () => {
    const app = testApp()
    const root = await app.request('https://store.example/')
    const robots = await app.request('https://store.example/robots.txt')
    const sitemap = await app.request('https://store.example/sitemap.xml')

    expect(root.status).toBe(301)
    expect(root.headers.get('Location')).toBe('https://store.example/rankings')
    expect(await robots.text()).toContain('Sitemap: https://deepseek1024.com/sitemap.xml')
    expect(sitemap.headers.get('Content-Type')).toContain('application/xml')
    expect(await sitemap.text()).toContain('<loc>https://deepseek1024.com/plugin</loc>')
  })

  it('reports service health', async () => {
    const response = await testApp().request('/api/health')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ ok: true, service: 'dsh-1024store' })
  })

  it('reports the current dsh-1024store version for automatic update checks', async () => {
    const response = await testApp().request('/api/dsh-1024store')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      name: 'dsh-1024store',
      version: storeManifest.version,
    })
  })

  it('serves the generated public registry with cross-origin access', async () => {
    const response = await testApp().request('/plugins.json', {
      headers: { Origin: 'https://registry-consumer.example' },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    const body = (await response.json()) as { count: number; revision: string; plugins: unknown[] }
    expect(body.count).toBe(TEST_PLUGINS.length)
    expect(body.plugins).toHaveLength(body.count)
    expect(body.revision).toBe(testCatalogResult().snapshot.registryRevision)
    expect(response.headers.get('X-Catalog-Source')).toBe('bundled')
  })

  it('permanently redirects legacy package URLs to canonical plugin paths', async () => {
    const app = testApp()
    const catalog = await app.request('https://store.example/packages?q=terminal')
    const trailingCatalog = await app.request('https://store.example/packages/?q=terminal')
    const detail = await app.request(
      'https://store.example/packages/openma-ai/deepseek-harness-tui?source=legacy',
    )
    const apiCatalog = await app.request('https://store.example/api/packages?q=terminal')
    const apiDetail = await app.request(
      'https://store.example/api/packages/openma-ai/deepseek-harness-tui?source=legacy',
    )

    expect(catalog.status).toBe(301)
    expect(catalog.headers.get('Location')).toBe('https://store.example/plugin?q=terminal')
    expect(trailingCatalog.status).toBe(301)
    expect(trailingCatalog.headers.get('Location')).toBe('https://store.example/plugin?q=terminal')
    expect(detail.status).toBe(301)
    expect(detail.headers.get('Location')).toBe(
      'https://store.example/plugin/openma-ai/deepseek-harness-tui?source=legacy',
    )
    expect(apiCatalog.status).toBe(301)
    expect(apiCatalog.headers.get('Location')).toBe('https://store.example/api/plugin?q=terminal')
    expect(apiDetail.status).toBe(301)
    expect(apiDetail.headers.get('Location')).toBe(
      'https://store.example/api/plugin/openma-ai/deepseek-harness-tui?source=legacy',
    )
  })

  it('returns every filtered result with rankings and cache metadata', async () => {
    const response = await testApp().request('/api/plugin?category=fun&q=gomoku')
    expect(response.status).toBe(200)
    expect(response.headers.get('X-Catalog-Source')).toBe('bundled')
    const body = (await response.json()) as {
      packages: Array<{ name: string }>
      rankings: { stars: Array<{ name: string }> }
      meta: { total: number; catalogTotal: number }
    }
    expect(body.packages.map((plugin) => plugin.name)).toEqual(['dsh-gomoku'])
    expect(body.rankings.stars[0]?.name).toBe('dsh-crosstalk')
    expect(body.meta).toMatchObject({ total: 1, catalogTotal: 7 })
  })

  it('serves curated package details and rejects invalid identifiers', async () => {
    const app = testApp()
    const detail = await app.request('/api/plugin/openma-ai/deepseek-harness-tui')
    expect(detail.status).toBe(200)

    const invalid = await app.request('/api/plugin/openma-ai/not%20valid')
    expect(invalid.status).toBe(400)

    const missing = await app.request('/api/plugin/openma-ai/missing')
    expect(missing.status).toBe(404)
  })

  it('accepts a strict, catalog-backed installation event without exposing client identity', async () => {
    const { app, eventRecorder } = telemetryApp()
    const response = await app.request('/api/v1/install-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://cli.example' },
      body: JSON.stringify(VALID_INSTALL_EVENT),
    }, TELEMETRY_ENV)

    expect(response.status).toBe(202)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    await expect(response.json()).resolves.toMatchObject({
      accepted: true,
      duplicate: false,
      eventId: VALID_INSTALL_EVENT.eventId,
      pluginId: VALID_INSTALL_EVENT.pluginId,
      serverReceivedAt: '2026-08-14T12:05:00.000Z',
    })
    expect(eventRecorder).toHaveBeenCalledOnce()
  })

  it('returns duplicate eventIds idempotently', async () => {
    const { app } = telemetryApp(true)
    const response = await app.request('/api/v1/install-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_INSTALL_EVENT),
    }, TELEMETRY_ENV)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ accepted: true, duplicate: true })
  })

  it('fails closed when the hashing secret is missing and returns client rate limits', async () => {
    const missingSecret = telemetryApp()
    const unavailable = await missingSecret.app.request('/api/v1/install-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_INSTALL_EVENT),
    }, { CATALOG_DB: {} } as unknown as Env)
    expect(unavailable.status).toBe(503)
    expect(missingSecret.eventRecorder).not.toHaveBeenCalled()

    const limited = telemetryApp('rate-limit')
    const response = await limited.app.request('/api/v1/install-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_INSTALL_EVENT),
    }, TELEMETRY_ENV)
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('30')
    await expect(response.json()).resolves.toEqual({ error: 'Too many installation events.' })
  })

  it('rejects oversized bodies, extra fields, and plugins outside the catalog', async () => {
    const { app, eventRecorder } = telemetryApp()
    const oversized = await app.request('/api/v1/install-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_INSTALL_EVENT, requestedRef: 'x'.repeat(9_000) }),
    }, TELEMETRY_ENV)
    expect(oversized.status).toBe(413)

    const extra = await app.request('/api/v1/install-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_INSTALL_EVENT, command: 'private command' }),
    }, TELEMETRY_ENV)
    expect(extra.status).toBe(400)
    await expect(extra.json()).resolves.toMatchObject({ error: 'Unexpected field: command.' })

    const unknown = await app.request('/api/v1/install-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_INSTALL_EVENT, pluginId: 'unknown/not-in-catalog' }),
    }, TELEMETRY_ENV)
    expect(unknown.status).toBe(404)
    expect(eventRecorder).not.toHaveBeenCalled()
  })

  it('merges aggregate installation metrics into package details and serves stats directly', async () => {
    const metrics = {
      ...emptyInstallMetrics(),
      installCount: 12,
      installerCount: 8,
      installs24h: 3,
      latestInstallAt: '2026-08-14T12:05:00.000Z',
    }
    const app = createApp({
      catalogLoader: vi.fn(async () => testCatalogResult()),
      detailLoader: vi.fn(async () => ({
        ...TEST_PLUGINS[0],
        github: null,
        manifest: null,
        readme: null,
        verification: { repositoryReachable: false, bundleDeclared: false },
      })),
      installStatsLoader: vi.fn(async () => metrics),
      clock: () => Date.parse('2026-08-14T12:06:00Z'),
    })
    const detail = await app.request(
      '/api/plugin/openma-ai/deepseek-harness-tui',
      undefined,
      TELEMETRY_ENV,
    )
    expect(detail.status).toBe(200)
    await expect(detail.json()).resolves.toMatchObject(metrics)

    const stats = await app.request(
      '/api/install-stats/openma-ai/deepseek-harness-tui',
      undefined,
      TELEMETRY_ENV,
    )
    expect(stats.status).toBe(200)
    await expect(stats.json()).resolves.toMatchObject({
      pluginId: 'openma-ai/deepseek-harness-tui',
      ...metrics,
      generatedAt: '2026-08-14T12:06:00.000Z',
    })
  })
})
