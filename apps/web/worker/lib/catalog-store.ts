import type {
  BackgroundContext,
  CatalogPlugin,
  CatalogSnapshotResult,
  InstallMetrics,
  StoredCatalogSnapshot,
} from '../types'
import { categoryLabelMap } from './categories'
import { loadCatalogSnapshotFromD1, saveCatalogMetrics } from './catalog-db'
import { fetchGitHubMetrics, metricKey } from './github-metrics'
import { emptyInstallMetrics, loadInstallMetrics } from './install-metrics'
import { updateStarHistory } from './star-history'

const SNAPSHOT_KEY = 'catalog:snapshot:v8'
const SNAPSHOT_TTL_MS = 15 * 60 * 1000

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isCatalogPlugin(value: unknown): value is CatalogPlugin {
  if (!isObject(value) || !isObject(value.description)) return false
  return (
    typeof value.name === 'string' &&
    typeof value.owner === 'string' &&
    typeof value.url === 'string' &&
    typeof value.repository === 'string' &&
    typeof value.category === 'string' &&
    typeof value.description.en === 'string' &&
    typeof value.description.zh === 'string' &&
    typeof value.install === 'string' &&
    typeof value.added === 'string' &&
    (typeof value.stars === 'number' || value.stars === null) &&
    (typeof value.forks === 'number' || value.forks === null) &&
    (typeof value.pushedAt === 'string' || value.pushedAt === null) &&
    (typeof value.updatedAt === 'string' || value.updatedAt === null) &&
    (typeof value.latestReleaseAt === 'string' || value.latestReleaseAt === null) &&
    (typeof value.growth24h === 'number' || value.growth24h === null) &&
    (typeof value.growth7d === 'number' || value.growth7d === null) &&
    (typeof value.growth30d === 'number' || value.growth30d === null) &&
    typeof value.installCount === 'number' &&
    typeof value.installerCount === 'number' &&
    typeof value.firstInstallCount === 'number' &&
    typeof value.reinstallCount === 'number' &&
    typeof value.updateCount === 'number' &&
    typeof value.removeCount === 'number' &&
    typeof value.failureCount === 'number' &&
    typeof value.installs24h === 'number' &&
    typeof value.installs7d === 'number' &&
    typeof value.installs30d === 'number' &&
    (typeof value.latestInstallAt === 'string' || value.latestInstallAt === null)
  )
}

function isLocalizedCategory(value: unknown): boolean {
  return isObject(value) && typeof value.en === 'string' && typeof value.zh === 'string'
}

export function isStoredCatalogSnapshot(value: unknown): value is StoredCatalogSnapshot {
  if (!isObject(value)) return false
  return (
    typeof value.generatedAt === 'string' &&
    typeof value.registryUpdated === 'string' &&
    typeof value.registryRevision === 'string' &&
    typeof value.metricCoverage === 'number' &&
    isObject(value.categories) &&
    Object.values(value.categories).every(isLocalizedCategory) &&
    Array.isArray(value.plugins) &&
    value.plugins.length > 0 &&
    value.plugins.every(isCatalogPlugin)
  )
}

function logRefreshError(error: unknown): void {
  console.error(
    JSON.stringify({
      message: 'catalog_refresh_failed',
      error: error instanceof Error ? error.message : String(error),
    }),
  )
}

function logInstallMetricsError(error: unknown): void {
  console.error(
    JSON.stringify({
      message: 'install_metrics_refresh_failed',
      error: error instanceof Error ? error.message : String(error),
    }),
  )
}

function installMetricKey(plugin: Pick<CatalogPlugin, 'owner' | 'repository'>): string {
  return `${plugin.owner}/${plugin.repository}`.toLocaleLowerCase()
}

function installMetricsFrom(plugin: CatalogPlugin): InstallMetrics {
  return {
    installCount: plugin.installCount,
    installerCount: plugin.installerCount,
    firstInstallCount: plugin.firstInstallCount,
    reinstallCount: plugin.reinstallCount,
    updateCount: plugin.updateCount,
    removeCount: plugin.removeCount,
    failureCount: plugin.failureCount,
    installs24h: plugin.installs24h,
    installs7d: plugin.installs7d,
    installs30d: plugin.installs30d,
    latestInstallAt: plugin.latestInstallAt,
  }
}

async function readStoredSnapshot(env: Env): Promise<StoredCatalogSnapshot | null> {
  try {
    const value: unknown = await env.CATALOG_CACHE.get(SNAPSHOT_KEY, 'json')
    return isStoredCatalogSnapshot(value) ? value : null
  } catch (error) {
    logRefreshError(error)
    return null
  }
}

function emptyCatalogSnapshot(capturedAt: number): StoredCatalogSnapshot {
  const generatedAt = new Date(capturedAt).toISOString()
  return {
    generatedAt,
    registryUpdated: generatedAt.slice(0, 10),
    registryRevision: 'empty',
    metricCoverage: 0,
    categories: categoryLabelMap(),
    plugins: [],
  }
}

export async function refreshCatalogSnapshot(
  env: Env,
  fetcher: typeof fetch = fetch,
  capturedAt: number = Date.now(),
): Promise<CatalogSnapshotResult> {
  const previousSnapshot = await readStoredSnapshot(env)
  if (env.CATALOG_DB) {
    try {
      const generatedAt = new Date(capturedAt).toISOString()
      const d1Snapshot = await loadCatalogSnapshotFromD1(env.CATALOG_DB, generatedAt)
      if (d1Snapshot) {
        const token = env.GITHUB_TOKEN?.trim() || undefined
        const metrics = await fetchGitHubMetrics(d1Snapshot.plugins, token, fetcher)
        const previousByRepository = new Map(
          previousSnapshot?.plugins.map((plugin) => [metricKey(plugin), plugin]) ?? [],
        )
        let plugins = d1Snapshot.plugins.map((plugin) => {
          const metric = metrics.get(metricKey(plugin))
          const previous = previousByRepository.get(metricKey(plugin))
          return {
            ...plugin,
            ...(previous ? installMetricsFrom(previous) : emptyInstallMetrics()),
            stars: metric?.stars ?? plugin.stars ?? previous?.stars ?? null,
            forks: metric?.forks ?? plugin.forks ?? previous?.forks ?? null,
            pushedAt: metric?.pushedAt ?? plugin.pushedAt ?? previous?.pushedAt ?? null,
            updatedAt: metric?.updatedAt ?? plugin.updatedAt ?? previous?.updatedAt ?? null,
            latestReleaseAt: metric?.latestReleaseAt ?? previous?.latestReleaseAt ?? null,
            growth24h: previous?.growth24h ?? null,
            growth7d: previous?.growth7d ?? null,
            growth30d: previous?.growth30d ?? null,
          }
        })
        const freshPlugins = plugins.filter((plugin) => metrics.has(metricKey(plugin)))
        await saveCatalogMetrics(env.CATALOG_DB, freshPlugins, generatedAt)
        const tracked = plugins.filter((plugin) => plugin.stars !== null)
        if (tracked.length > 0 && env.CATALOG_DB) {
          const growth = await updateStarHistory(env.CATALOG_DB, tracked, capturedAt)
          plugins = plugins.map((plugin) => ({
            ...plugin,
            ...(growth.get(metricKey(plugin)) ?? {}),
          }))
        }
        try {
          const installMetrics = await loadInstallMetrics(
            env.CATALOG_DB,
            plugins.map((plugin) => `${plugin.owner}/${plugin.repository}`),
            capturedAt,
          )
          plugins = plugins.map((plugin) => ({
            ...plugin,
            ...(installMetrics.get(installMetricKey(plugin)) ?? emptyInstallMetrics()),
          }))
        } catch (error) {
          logInstallMetricsError(error)
        }
        const snapshot = {
          ...d1Snapshot,
          metricCoverage: plugins.filter((plugin) => plugin.stars !== null).length,
          plugins,
        }
        try {
          await env.CATALOG_CACHE.put(SNAPSHOT_KEY, JSON.stringify(snapshot))
        } catch (error) {
          logRefreshError(error)
        }
        return { snapshot, source: 'd1' }
      }
    } catch (error) {
      logRefreshError(error)
    }
  }

  // D1 is the only source of truth. When it is unavailable (or still empty)
  // the stale KV snapshot is the only degradation layer; past that, serve an
  // explicitly empty snapshot so callers can surface the condition via meta.
  if (previousSnapshot) {
    return { snapshot: previousSnapshot, source: 'stale' }
  }
  return { snapshot: emptyCatalogSnapshot(capturedAt), source: 'empty' }
}

export async function loadCatalogSnapshot(
  env: Env,
  ctx?: BackgroundContext,
  fetcher: typeof fetch = fetch,
): Promise<CatalogSnapshotResult> {
  const stored = await readStoredSnapshot(env)
  const cached = stored

  if (cached) {
    const age = Date.now() - new Date(cached.generatedAt).getTime()
    if (Number.isFinite(age) && age <= SNAPSHOT_TTL_MS) {
      return { snapshot: cached, source: 'kv' }
    }

    if (ctx) {
      ctx.waitUntil(refreshCatalogSnapshot(env, fetcher).then(() => undefined).catch(logRefreshError))
      return { snapshot: cached, source: 'stale' }
    }

    try {
      return await refreshCatalogSnapshot(env, fetcher)
    } catch (error) {
      logRefreshError(error)
      return { snapshot: cached, source: 'stale' }
    }
  }

  return refreshCatalogSnapshot(env, fetcher)
}

export async function runScheduledCatalogRefresh(
  env: Env,
  capturedAt: number = Date.now(),
): Promise<void> {
  try {
    const result = await refreshCatalogSnapshot(env, fetch, capturedAt)
    console.log(
      JSON.stringify({
        message: 'catalog_refresh_completed',
        source: result.source,
        plugins: result.snapshot.plugins.length,
        metricCoverage: result.snapshot.metricCoverage,
        generatedAt: result.snapshot.generatedAt,
      }),
    )
  } catch (error) {
    logRefreshError(error)
    throw error
  }
}
