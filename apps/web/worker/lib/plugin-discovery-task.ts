import {
  claimScanLease,
  completeScanRun,
  getCatalogState,
  loadPendingValidationRepositories,
  markMissingTopicRepositories,
  releaseScanLease,
  saveRepositoryInspections,
  setCatalogState,
  startScanRun,
  upsertDiscoveredRepositories,
  type ScanCounters,
} from './catalog-db'
import { refreshCatalogSnapshot } from './catalog-store'
import {
  createGitHubClient,
  discoverRepositories,
  incrementalStart,
  inspectRepository,
} from './github-discovery'

const DEFAULT_TOPIC = 'dsh-plugin'
const DISCOVERY_CHUNK_SIZE = 40
const VALIDATION_CHUNK_SIZE = 20
const CORE_RATE_LIMIT_RESERVE = 500
const TASK_DEADLINE_MS = 12 * 60 * 1000
const LEASE_MS = 20 * 60 * 1000

interface RateLimitResponse {
  resources: {
    core: {
      remaining: number
    }
  }
}

export interface PluginDiscoveryResult extends ScanCounters {
  mode: 'incremental' | 'full'
  skipped?: boolean
  pending?: boolean
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }
  return result
}

async function withRetry<T>(callback: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await callback()
    } catch (error) {
      lastError = error
      if (attempt < attempts - 1) await scheduler.wait(5_000 * 2 ** attempt)
    }
  }
  throw lastError
}

export async function runPluginDiscoveryTask(
  env: Env,
  requestedMode?: 'incremental' | 'full',
  scheduledTime = Date.now(),
): Promise<PluginDiscoveryResult> {
  const started = Date.now()
  const deadline = started + TASK_DEADLINE_MS
  const runAt = new Date(scheduledTime)
  const end = runAt.toISOString().replace(/\.\d{3}Z$/, 'Z')
  const runId = crypto.randomUUID()
  let leaseClaimed = false
  let mode: 'incremental' | 'full' = requestedMode ?? 'incremental'
  const counters: ScanCounters = { discovered: 0, changed: 0, accepted: 0, rejected: 0 }

  try {
    leaseClaimed = await claimScanLease(env.CATALOG_DB, runId, runAt, LEASE_MS)
    if (!leaseClaimed) return { ...counters, mode, skipped: true }
    const watermark = await getCatalogState(env.CATALOG_DB, 'discovery_watermark')
    mode = requestedMode ?? (watermark === null ? 'full' : 'incremental')
    await startScanRun(env.CATALOG_DB, runId, mode, end)

    const client = createGitHubClient(env.GITHUB_TOKEN.trim())
    const repositories = await withRetry(() => discoverRepositories(
      client,
      DEFAULT_TOPIC,
      mode,
      mode === 'full' ? null : incrementalStart(watermark as string),
      end,
    ))
    counters.discovered = repositories.length
    for (const group of chunks(repositories, DISCOVERY_CHUNK_SIZE)) {
      const result = await upsertDiscoveredRepositories(env.CATALOG_DB, group, runId, end)
      counters.changed += result.changedCount
    }

    let pending = false
    while (Date.now() < deadline) {
      const candidates = await loadPendingValidationRepositories(
        env.CATALOG_DB,
        VALIDATION_CHUNK_SIZE,
      )
      if (candidates.length === 0) break
      const rateLimit = await client.request<RateLimitResponse>('/rate_limit')
      if (rateLimit.resources.core.remaining <= CORE_RATE_LIMIT_RESERVE) {
        pending = true
        break
      }
      const inspections = []
      for (const repository of candidates) {
        if (Date.now() >= deadline ||
          (client.getRateLimitRemaining() ?? Number.POSITIVE_INFINITY) <= CORE_RATE_LIMIT_RESERVE) {
          pending = true
          break
        }
        inspections.push(await withRetry(() => inspectRepository(client, repository)))
      }
      if (inspections.length === 0) break
      await saveRepositoryInspections(env.CATALOG_DB, inspections, end)
      counters.accepted += inspections.filter((item) => item.status === 'accepted').length
      counters.rejected += inspections.filter((item) => item.status === 'rejected').length
      if (inspections.length < candidates.length) break
    }
    if (Date.now() >= deadline) pending = true

    if (mode === 'full') await markMissingTopicRepositories(env.CATALOG_DB, runId, end)
    await setCatalogState(env.CATALOG_DB, 'discovery_watermark', end, end)
    const completedAt = new Date().toISOString()
    await completeScanRun(env.CATALOG_DB, runId, 'completed', counters, undefined, completedAt)
    await refreshCatalogSnapshot(env, fetch, new Date(completedAt).getTime())
    await releaseScanLease(env.CATALOG_DB, runId)
    leaseClaimed = false
    return { ...counters, mode, pending }
  } catch (error) {
    if (leaseClaimed) {
      const message = error instanceof Error ? error.message : String(error)
      await completeScanRun(
        env.CATALOG_DB,
        runId,
        'failed',
        counters,
        message,
        new Date().toISOString(),
      )
      await releaseScanLease(env.CATALOG_DB, runId)
    }
    throw error
  }
}
