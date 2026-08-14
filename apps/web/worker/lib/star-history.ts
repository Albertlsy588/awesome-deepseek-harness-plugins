import type { CatalogPlugin, StarGrowth } from '../types'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const HISTORY_RETENTION_MS = 45 * DAY_MS
const BASELINE_TOLERANCE_MS = 2 * HOUR_MS
const INSERT_ROWS_PER_STATEMENT = 25
const REPOSITORIES_PER_LOOKUP = 80

const WINDOWS = {
  growth24h: DAY_MS,
  growth7d: 7 * DAY_MS,
  growth30d: 30 * DAY_MS,
} as const

type GrowthField = keyof typeof WINDOWS

interface SnapshotRow {
  repository: string
  bucket_hour: number
  captured_at: number
  star_count: number
}

interface BaselineCandidate {
  distance: number
  capturedAt: number
  stars: number
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let offset = 0; offset < items.length; offset += size) {
    result.push(items.slice(offset, offset + size))
  }
  return result
}

function repositoryKey(plugin: Pick<CatalogPlugin, 'owner' | 'repository'>): string {
  return `${plugin.owner}/${plugin.repository}`.toLocaleLowerCase()
}

export function emptyStarGrowth(): StarGrowth {
  return {
    growth24h: null,
    growth7d: null,
    growth30d: null,
  }
}

export function hourBucket(timestamp: number): number {
  return Math.floor(timestamp / HOUR_MS) * HOUR_MS
}

export async function recordStarSnapshots(
  db: D1Database,
  plugins: CatalogPlugin[],
  capturedAt: number,
): Promise<void> {
  const tracked = plugins.filter((plugin) => plugin.stars !== null)
  if (tracked.length === 0) return

  const bucketHour = hourBucket(capturedAt)
  const statements = chunks(tracked, INSERT_ROWS_PER_STATEMENT).map((batch) => {
    const placeholders = batch.map(() => '(?, ?, ?, ?)').join(', ')
    const values = batch.flatMap((plugin) => [
      repositoryKey(plugin),
      bucketHour,
      capturedAt,
      plugin.stars as number,
    ])
    return db.prepare(`
      INSERT INTO github_star_snapshots (
        repository,
        bucket_hour,
        captured_at,
        star_count
      ) VALUES ${placeholders}
      ON CONFLICT(repository, bucket_hour) DO UPDATE SET
        captured_at = excluded.captured_at,
        star_count = excluded.star_count
    `).bind(...values)
  })

  await db.batch(statements)

  const scheduledAt = new Date(capturedAt)
  if (scheduledAt.getUTCHours() === 0 && scheduledAt.getUTCMinutes() === 0) {
    await db.prepare('DELETE FROM github_star_snapshots WHERE bucket_hour < ?')
      .bind(hourBucket(capturedAt - HISTORY_RETENTION_MS))
      .run()
  }
}

export async function loadStarGrowth(
  db: D1Database,
  plugins: CatalogPlugin[],
  capturedAt: number,
): Promise<Map<string, StarGrowth>> {
  const currentStars = new Map(
    plugins
      .filter((plugin) => plugin.stars !== null)
      .map((plugin) => [repositoryKey(plugin), plugin.stars as number]),
  )
  const repositories = [...currentStars.keys()]
  const candidates = new Map<string, Partial<Record<GrowthField, BaselineCandidate>>>()
  const targets = Object.fromEntries(
    Object.entries(WINDOWS).map(([field, duration]) => [field, capturedAt - duration]),
  ) as Record<GrowthField, number>

  for (const repositoryBatch of chunks(repositories, REPOSITORIES_PER_LOOKUP)) {
    const repositoryPlaceholders = repositoryBatch.map(() => '?').join(', ')
    const ranges = Object.values(targets).flatMap((target) => [
      hourBucket(target - BASELINE_TOLERANCE_MS),
      hourBucket(target + BASELINE_TOLERANCE_MS),
    ])
    const result = await db.prepare(`
      SELECT repository, bucket_hour, captured_at, star_count
      FROM github_star_snapshots
      WHERE repository IN (${repositoryPlaceholders})
        AND (
          bucket_hour BETWEEN ? AND ?
          OR bucket_hour BETWEEN ? AND ?
          OR bucket_hour BETWEEN ? AND ?
        )
    `).bind(...repositoryBatch, ...ranges).all<SnapshotRow>()

    for (const row of result.results) {
      const key = row.repository.toLocaleLowerCase()
      if (!currentStars.has(key)) continue
      const repositoryCandidates = candidates.get(key) ?? {}
      for (const field of Object.keys(WINDOWS) as GrowthField[]) {
        const distance = Math.abs(row.captured_at - targets[field])
        const previous = repositoryCandidates[field]
        const isCloser = !previous || distance < previous.distance
        const isNewerTie = previous &&
          distance === previous.distance &&
          row.captured_at > previous.capturedAt
        if (distance <= BASELINE_TOLERANCE_MS && (isCloser || isNewerTie)) {
          repositoryCandidates[field] = {
            distance,
            capturedAt: row.captured_at,
            stars: row.star_count,
          }
        }
      }
      candidates.set(key, repositoryCandidates)
    }
  }

  return new Map(
    repositories.map((repository) => {
      const stars = currentStars.get(repository) as number
      const baseline = candidates.get(repository)
      return [repository, {
        growth24h: baseline?.growth24h ? stars - baseline.growth24h.stars : null,
        growth7d: baseline?.growth7d ? stars - baseline.growth7d.stars : null,
        growth30d: baseline?.growth30d ? stars - baseline.growth30d.stars : null,
      }]
    }),
  )
}

export async function updateStarHistory(
  db: D1Database,
  plugins: CatalogPlugin[],
  capturedAt: number,
): Promise<Map<string, StarGrowth>> {
  await recordStarSnapshots(db, plugins, capturedAt)
  return loadStarGrowth(db, plugins, capturedAt)
}
