import type {
  BackgroundContext,
  CatalogPlugin,
  CatalogSnapshotResult,
  StoredCatalogSnapshot,
} from '../types'
import { repositoryName } from './catalog'
import { fetchGitHubMetrics, metricKey } from './github-metrics'
import { BUNDLED_REGISTRY, loadRegistry } from './registry'
import { emptyStarGrowth, updateStarHistory } from './star-history'

const SNAPSHOT_KEY = 'catalog:snapshot:v4'
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
    (typeof value.growth30d === 'number' || value.growth30d === null)
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

function logStarHistoryError(error: unknown): void {
  console.error(
    JSON.stringify({
      message: 'star_history_refresh_failed',
      error: error instanceof Error ? error.message : String(error),
    }),
  )
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

export async function refreshCatalogSnapshot(
  env: Env,
  fetcher: typeof fetch = fetch,
  capturedAt: number = Date.now(),
): Promise<CatalogSnapshotResult> {
  const [registryResult, previousSnapshot] = await Promise.all([
    loadRegistry(),
    readStoredSnapshot(env),
  ])
  const token = env.GITHUB_TOKEN?.trim() || undefined
  const metrics = await fetchGitHubMetrics(registryResult.registry.plugins, token, fetcher)
  const previousMetrics = new Map(
    previousSnapshot?.plugins.map((plugin) => [metricKey(plugin), plugin]) ?? [],
  )
  let plugins = registryResult.registry.plugins.map<CatalogPlugin>((plugin) => {
    const metric = metrics.get(metricKey(plugin))
    const previous = previousMetrics.get(metricKey(plugin))
    const previousGrowth = previous
      ? {
          growth24h: previous.growth24h,
          growth7d: previous.growth7d,
          growth30d: previous.growth30d,
        }
      : emptyStarGrowth()
    return {
      ...plugin,
      ...previousGrowth,
      repository: repositoryName(plugin),
      stars: metric?.stars ?? previous?.stars ?? null,
      forks: metric?.forks ?? previous?.forks ?? null,
      pushedAt: metric?.pushedAt ?? previous?.pushedAt ?? null,
      updatedAt: metric?.updatedAt ?? previous?.updatedAt ?? null,
      latestReleaseAt: metric?.latestReleaseAt ?? previous?.latestReleaseAt ?? null,
    }
  })

  const freshPlugins = plugins.filter((plugin) => metrics.has(metricKey(plugin)))
  if (freshPlugins.length > 0 && env.STAR_HISTORY) {
    try {
      const growth = await updateStarHistory(env.STAR_HISTORY, freshPlugins, capturedAt)
      plugins = plugins.map((plugin) => ({
        ...plugin,
        ...(growth.get(metricKey(plugin)) ?? {}),
      }))
    } catch (error) {
      logStarHistoryError(error)
    }
  }

  const snapshot: StoredCatalogSnapshot = {
    generatedAt: new Date(capturedAt).toISOString(),
    registryUpdated: registryResult.registry.updated,
    registryRevision: registryResult.registry.revision,
    metricCoverage: plugins.filter((plugin) => plugin.stars !== null).length,
    categories: registryResult.registry.categories,
    plugins,
  }

  try {
    await env.CATALOG_CACHE.put(SNAPSHOT_KEY, JSON.stringify(snapshot))
  } catch (error) {
    logRefreshError(error)
  }

  return {
    snapshot,
    source: registryResult.source,
  }
}

export async function loadCatalogSnapshot(
  env: Env,
  ctx?: BackgroundContext,
  fetcher: typeof fetch = fetch,
): Promise<CatalogSnapshotResult> {
  const stored = await readStoredSnapshot(env)
  const cached = stored?.registryRevision === BUNDLED_REGISTRY.revision ? stored : null

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
