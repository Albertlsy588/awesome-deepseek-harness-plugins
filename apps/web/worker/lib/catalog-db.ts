import type { GitHubRepository, RepositoryInspection } from './github-discovery'
import type {
  CatalogPlugin,
  Registry,
  RegistryCategory,
  StoredCatalogSnapshot,
} from '../types'
import { repositoryName } from './catalog'
import { emptyInstallMetrics } from './install-metrics'

const UNCLASSIFIED_CATEGORY = {
  en: 'Unclassified',
  zh: '待分类',
} satisfies RegistryCategory

interface RepositoryIdentityRow {
  id: number
  github_id: number | null
  normalized_full_name: string
  default_branch: string | null
  pushed_at: string | null
  validation_status: string
}

// Bump this marker whenever the bundled-registry projection changes without a
// corresponding change to registry.generated.json. This v2 projection derives
// repository identity from the GitHub URL instead of the human-facing name.
const BUNDLED_REGISTRY_SYNC_VERSION = 'repository-url-v2'

interface PendingRepositoryRow {
  github_id: number
  full_name: string
  repository_name: string
  html_url: string
  description: string | null
  default_branch: string
  stars: number
  forks: number
  language: string | null
  license: string | null
  github_updated_at: string
  pushed_at: string | null
}

interface CatalogRow {
  full_name: string
  owner: string
  repository_name: string
  html_url: string
  description: string | null
  stars: number | null
  forks: number | null
  pushed_at: string | null
  github_updated_at: string | null
  display_name: string | null
  category: string | null
  description_en: string | null
  description_zh: string | null
  added: string | null
}

export interface ScanCounters {
  discovered: number
  changed: number
  accepted: number
  rejected: number
}

export interface RepositoryUpsertResult {
  changedCount: number
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }
  return result
}

export function normalizeRepositoryName(fullName: string): string {
  return fullName.trim().toLocaleLowerCase('en-US')
}

function repositoryParts(fullName: string): { owner: string; name: string } {
  const [owner, name, ...rest] = fullName.split('/')
  if (!owner || !name || rest.length > 0) throw new Error(`Invalid GitHub repository: ${fullName}`)
  return { owner, name }
}

async function queryRepositoryIdentities(
  db: D1Database,
  repositories: GitHubRepository[],
): Promise<Map<string, RepositoryIdentityRow>> {
  if (repositories.length === 0) return new Map()
  const ids = repositories.map((repository) => repository.id)
  const names = repositories.map((repository) => normalizeRepositoryName(repository.full_name))
  const placeholders = (values: unknown[]) => values.map(() => '?').join(', ')
  const result = await db.prepare(
    `SELECT id, github_id, normalized_full_name, default_branch, pushed_at, validation_status
       FROM catalog_repositories
      WHERE github_id IN (${placeholders(ids)})
         OR normalized_full_name IN (${placeholders(names)})`,
  ).bind(...ids, ...names).all<RepositoryIdentityRow>()
  const byKey = new Map<string, RepositoryIdentityRow>()
  for (const row of result.results) {
    if (row.github_id !== null) byKey.set(`id:${row.github_id}`, row)
    byKey.set(`name:${row.normalized_full_name}`, row)
  }
  return byKey
}

export async function syncBundledRegistry(
  db: D1Database,
  registry: Registry,
  now = new Date().toISOString(),
): Promise<void> {
  const syncRevision = `${BUNDLED_REGISTRY_SYNC_VERSION}:${registry.revision}`
  const revision = await getCatalogState(db, 'bundled_registry_revision')
  if (revision === syncRevision) return

  for (const group of chunks(registry.plugins, 50)) {
    await db.batch(group.map((plugin) => {
      const repository = repositoryName(plugin)
      const fullName = `${plugin.owner}/${repository}`
      return db.prepare(
        `INSERT INTO catalog_repositories (
           full_name, normalized_full_name, owner, repository_name, html_url,
           validation_status, topic_present, first_seen_at, last_seen_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?)
         ON CONFLICT(normalized_full_name) DO UPDATE SET
           full_name = excluded.full_name,
           owner = excluded.owner,
           repository_name = excluded.repository_name,
           html_url = excluded.html_url,
           last_seen_at = excluded.last_seen_at,
           updated_at = excluded.updated_at`,
      ).bind(
        fullName,
        normalizeRepositoryName(fullName),
        plugin.owner,
        repository,
        plugin.url,
        now,
        now,
        now,
        now,
      )
    }))
  }

  for (const group of chunks(registry.plugins, 40)) {
    const normalizedNames = group.map((plugin) =>
      normalizeRepositoryName(`${plugin.owner}/${repositoryName(plugin)}`))
    const result = await db.prepare(
      `SELECT id, normalized_full_name
         FROM catalog_repositories
        WHERE normalized_full_name IN (${normalizedNames.map(() => '?').join(', ')})`,
    ).bind(...normalizedNames).all<{ id: number; normalized_full_name: string }>()
    const ids = new Map(result.results.map((row) => [row.normalized_full_name, row.id]))
    const statements: D1PreparedStatement[] = []
    for (const plugin of group) {
      const fullName = `${plugin.owner}/${repositoryName(plugin)}`
      const id = ids.get(normalizeRepositoryName(fullName))
      if (id === undefined) throw new Error(`Bundled repository was not inserted: ${fullName}`)
      statements.push(
        db.prepare(
          `INSERT INTO catalog_repository_sources (
             repository_id, source, source_reference, first_seen_at, last_seen_at
           ) VALUES (?, 'github_pr', ?, ?, ?)
           ON CONFLICT(repository_id, source) DO UPDATE SET
             source_reference = excluded.source_reference,
             last_seen_at = excluded.last_seen_at`,
        ).bind(id, plugin.url, now, now),
        db.prepare(
          `INSERT INTO catalog_metadata (
             repository_id, display_name, category, description_en, description_zh,
             added, source, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, 'github_pr', ?)
           ON CONFLICT(repository_id) DO UPDATE SET
             display_name = excluded.display_name,
             category = excluded.category,
             description_en = excluded.description_en,
             description_zh = excluded.description_zh,
             added = excluded.added,
             updated_at = excluded.updated_at`,
        ).bind(
          id,
          plugin.name,
          plugin.category,
          plugin.description.en,
          plugin.description.zh,
          plugin.added,
          now,
        ),
      )
    }
    await db.batch(statements)
  }

  const currentNames = JSON.stringify(
    registry.plugins.map((plugin) =>
      normalizeRepositoryName(`${plugin.owner}/${repositoryName(plugin)}`)),
  )
  await db.batch([
    db.prepare(
      `DELETE FROM catalog_metadata
        WHERE repository_id IN (
          SELECT s.repository_id
            FROM catalog_repository_sources s
            JOIN catalog_repositories r ON r.id = s.repository_id
           WHERE s.source = 'github_pr'
             AND r.normalized_full_name NOT IN (
               SELECT value FROM json_each(?)
             )
        )`,
    ).bind(currentNames),
    db.prepare(
      `DELETE FROM catalog_repository_sources
        WHERE source = 'github_pr'
          AND repository_id IN (
            SELECT r.id FROM catalog_repositories r
             WHERE r.normalized_full_name NOT IN (
               SELECT value FROM json_each(?)
             )
          )`,
    ).bind(currentNames),
  ])

  await setCatalogState(db, 'bundled_registry_revision', syncRevision, now)
}

export async function getCatalogState(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare('SELECT value FROM catalog_state WHERE key = ?')
    .bind(key)
    .first<{ value: string }>()
  return row?.value ?? null
}

export async function setCatalogState(
  db: D1Database,
  key: string,
  value: string,
  now = new Date().toISOString(),
): Promise<void> {
  await db.prepare(
    `INSERT INTO catalog_state (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).bind(key, value, now).run()
}

export async function claimScanLease(
  db: D1Database,
  runId: string,
  now: Date,
  leaseMilliseconds = 6 * 60 * 60 * 1000,
): Promise<boolean> {
  const nowIso = now.toISOString()
  const value = `${new Date(now.getTime() + leaseMilliseconds).toISOString()}|${runId}`
  const claimed = await db.prepare(
    `INSERT INTO catalog_state (key, value, updated_at)
     VALUES ('discovery_lease', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
       WHERE catalog_state.value < ? OR catalog_state.value LIKE ?
     RETURNING value`,
  ).bind(value, nowIso, `${nowIso}|`, `%|${runId}`).first<{ value: string }>()
  return claimed?.value === value
}

export async function releaseScanLease(db: D1Database, runId: string): Promise<void> {
  await db.prepare(
    `DELETE FROM catalog_state WHERE key = 'discovery_lease' AND value LIKE ?`,
  ).bind(`%|${runId}`).run()
}

export async function startScanRun(
  db: D1Database,
  runId: string,
  mode: 'incremental' | 'full',
  startedAt: string,
): Promise<void> {
  await db.prepare(
    `INSERT INTO catalog_scan_runs (run_id, mode, status, started_at)
     VALUES (?, ?, 'running', ?)
     ON CONFLICT(run_id) DO NOTHING`,
  ).bind(runId, mode, startedAt).run()
}

export async function completeScanRun(
  db: D1Database,
  runId: string,
  status: 'completed' | 'failed',
  counters: ScanCounters,
  error?: string,
  now = new Date().toISOString(),
): Promise<void> {
  await db.prepare(
    `UPDATE catalog_scan_runs
        SET status = ?, completed_at = ?, discovered_count = ?, changed_count = ?,
            accepted_count = ?, rejected_count = ?, error = ?
      WHERE run_id = ?`,
  ).bind(
    status,
    now,
    counters.discovered,
    counters.changed,
    counters.accepted,
    counters.rejected,
    error ?? null,
    runId,
  ).run()
}

export async function upsertDiscoveredRepositories(
  db: D1Database,
  repositories: GitHubRepository[],
  runId: string,
  now = new Date().toISOString(),
): Promise<RepositoryUpsertResult> {
  if (repositories.length > 40) throw new Error('Repository upsert chunks cannot exceed 40 items')
  const identities = await queryRepositoryIdentities(db, repositories)
  let changedCount = 0
  for (const repository of repositories) {
    const normalizedName = normalizeRepositoryName(repository.full_name)
    const byGithubId = identities.get(`id:${repository.id}`)
    const byName = identities.get(`name:${normalizedName}`)
    if (!byGithubId || !byName || byGithubId.id === byName.id) continue
    if (byName.github_id !== null && byName.github_id !== repository.id) {
      throw new Error(`Repository identity collision for ${repository.full_name}`)
    }
    await db.batch([
      db.prepare(
        `INSERT INTO catalog_repository_sources (
           repository_id, source, source_reference, first_seen_at, last_seen_at, last_seen_run_id
         )
         SELECT ?, source, source_reference, first_seen_at, last_seen_at, last_seen_run_id
           FROM catalog_repository_sources WHERE repository_id = ?
         ON CONFLICT(repository_id, source) DO UPDATE SET
           source_reference = excluded.source_reference,
           first_seen_at = MIN(catalog_repository_sources.first_seen_at, excluded.first_seen_at),
           last_seen_at = MAX(catalog_repository_sources.last_seen_at, excluded.last_seen_at),
           last_seen_run_id = excluded.last_seen_run_id`,
      ).bind(byName.id, byGithubId.id),
      db.prepare(
        `INSERT INTO catalog_metadata (
           repository_id, display_name, category, description_en, description_zh,
           added, source, updated_at
         )
         SELECT ?, display_name, category, description_en, description_zh,
                added, source, updated_at
           FROM catalog_metadata WHERE repository_id = ?
         ON CONFLICT(repository_id) DO NOTHING`,
      ).bind(byName.id, byGithubId.id),
      db.prepare('DELETE FROM catalog_repositories WHERE id = ?').bind(byGithubId.id),
    ])
    identities.set(`id:${repository.id}`, byName)
  }
  const incoming = repositories.map((repository) => {
    const normalizedName = normalizeRepositoryName(repository.full_name)
    const existing = identities.get(`id:${repository.id}`) ?? identities.get(`name:${normalizedName}`)
    const changed = existing === undefined ||
      existing.pushed_at !== repository.pushed_at ||
      existing.default_branch !== repository.default_branch ||
      existing.validation_status === 'pending' ||
      existing.validation_status === 'error'
    if (changed) {
      changedCount += 1
    }
    const { owner, name } = repositoryParts(repository.full_name)
    return {
      internalId: existing?.id ?? null,
      githubId: repository.id,
      fullName: repository.full_name,
      normalizedName,
      owner,
      name,
      htmlUrl: repository.html_url,
      description: repository.description,
      defaultBranch: repository.default_branch,
      stars: repository.stargazers_count,
      forks: repository.forks_count,
      language: repository.language,
      license: repository.license?.spdx_id ?? null,
      githubUpdatedAt: repository.updated_at,
      pushedAt: repository.pushed_at,
      validationStatus: changed ? 'pending' : existing?.validation_status ?? 'pending',
    }
  })
  const serialized = JSON.stringify(incoming)
  const existingCount = incoming.filter((repository) => repository.internalId !== null).length
  const newCount = incoming.length - existingCount

  if (existingCount > 0) {
    await db.prepare(
      `WITH incoming AS (
         SELECT
           CAST(json_extract(value, '$.internalId') AS INTEGER) AS internal_id,
           CAST(json_extract(value, '$.githubId') AS INTEGER) AS github_id,
           json_extract(value, '$.fullName') AS full_name,
           json_extract(value, '$.normalizedName') AS normalized_full_name,
           json_extract(value, '$.owner') AS owner,
           json_extract(value, '$.name') AS repository_name,
           json_extract(value, '$.htmlUrl') AS html_url,
           json_extract(value, '$.description') AS description,
           json_extract(value, '$.defaultBranch') AS default_branch,
           CAST(json_extract(value, '$.stars') AS INTEGER) AS stars,
           CAST(json_extract(value, '$.forks') AS INTEGER) AS forks,
           json_extract(value, '$.language') AS language,
           json_extract(value, '$.license') AS license,
           json_extract(value, '$.githubUpdatedAt') AS github_updated_at,
           json_extract(value, '$.pushedAt') AS pushed_at,
           json_extract(value, '$.validationStatus') AS validation_status
         FROM json_each(?)
         WHERE json_extract(value, '$.internalId') IS NOT NULL
       )
       UPDATE catalog_repositories
          SET (github_id, full_name, normalized_full_name, owner, repository_name,
               html_url, description, default_branch, stars, forks, language, license,
               github_updated_at, pushed_at, validation_status, topic_present,
               last_seen_at, updated_at) =
              (SELECT github_id, full_name, normalized_full_name, owner, repository_name,
                      html_url, description, default_branch, stars, forks, language, license,
                      github_updated_at, pushed_at, validation_status, 1, ?, ?
                 FROM incoming WHERE internal_id = catalog_repositories.id)
        WHERE id IN (SELECT internal_id FROM incoming)`,
    ).bind(serialized, now, now).run()
  }

  if (newCount > 0) {
    await db.prepare(
      `INSERT INTO catalog_repositories (
         github_id, full_name, normalized_full_name, owner, repository_name, html_url,
         description, default_branch, stars, forks, language, license, github_updated_at,
         pushed_at, validation_status, topic_present, first_seen_at, last_seen_at,
         created_at, updated_at
       )
       SELECT
         CAST(json_extract(value, '$.githubId') AS INTEGER),
         json_extract(value, '$.fullName'), json_extract(value, '$.normalizedName'),
         json_extract(value, '$.owner'), json_extract(value, '$.name'),
         json_extract(value, '$.htmlUrl'), json_extract(value, '$.description'),
         json_extract(value, '$.defaultBranch'), CAST(json_extract(value, '$.stars') AS INTEGER),
         CAST(json_extract(value, '$.forks') AS INTEGER), json_extract(value, '$.language'),
         json_extract(value, '$.license'), json_extract(value, '$.githubUpdatedAt'),
         json_extract(value, '$.pushedAt'), 'pending', 1, ?, ?, ?, ?
       FROM json_each(?)
       WHERE json_extract(value, '$.internalId') IS NULL`,
    ).bind(now, now, now, now, serialized).run()
  }

  await db.prepare(
    `INSERT INTO catalog_repository_sources (
       repository_id, source, source_reference, first_seen_at, last_seen_at, last_seen_run_id
     )
     SELECT r.id, 'github_topic', json_extract(j.value, '$.htmlUrl'), ?, ?, ?
       FROM json_each(?) j
       JOIN catalog_repositories r
         ON r.normalized_full_name = json_extract(j.value, '$.normalizedName')
     ON CONFLICT(repository_id, source) DO UPDATE SET
       source_reference = excluded.source_reference,
       last_seen_at = excluded.last_seen_at,
       last_seen_run_id = excluded.last_seen_run_id`,
  ).bind(now, now, runId, serialized).run()

  return { changedCount }
}

export async function loadPendingValidationRepositories(
  db: D1Database,
  limit = 20,
): Promise<GitHubRepository[]> {
  const result = await db.prepare(
    `SELECT github_id, full_name, repository_name, html_url, description, default_branch,
            stars, forks, language, license, github_updated_at, pushed_at
       FROM catalog_repositories
      WHERE github_id IS NOT NULL
        AND topic_present = 1
        AND validation_status = 'pending'
      ORDER BY last_scanned_at IS NOT NULL, last_scanned_at, id
      LIMIT ?`,
  ).bind(limit).all<PendingRepositoryRow>()
  return result.results.map((row) => ({
    id: row.github_id,
    name: row.repository_name,
    full_name: row.full_name,
    html_url: row.html_url,
    description: row.description,
    fork: false,
    archived: false,
    disabled: false,
    default_branch: row.default_branch,
    stargazers_count: row.stars,
    forks_count: row.forks,
    language: row.language,
    license: row.license === null ? null : { spdx_id: row.license },
    updated_at: row.github_updated_at,
    pushed_at: row.pushed_at,
  }))
}

export async function saveRepositoryInspections(
  db: D1Database,
  inspections: RepositoryInspection[],
  now = new Date().toISOString(),
): Promise<void> {
  if (inspections.length === 0) return
  await db.batch(inspections.map((inspection) => db.prepare(
    `UPDATE catalog_repositories SET
       validation_status = ?, validation_code = ?, validation_reason = ?,
       package_name = ?, package_version = ?, package_path = ?, bundle_patch = ?,
       last_scanned_at = ?, updated_at = ?
     WHERE github_id = ?`,
  ).bind(
    inspection.status,
    inspection.code,
    inspection.reason,
    inspection.package?.name ?? null,
    inspection.package?.version ?? null,
    inspection.package?.path ?? null,
    inspection.package?.patch ?? null,
    now,
    now,
    inspection.githubId,
  )))
}

export async function saveCatalogMetrics(
  db: D1Database,
  plugins: CatalogPlugin[],
  now = new Date().toISOString(),
): Promise<void> {
  if (plugins.length === 0) return
  for (const group of chunks(plugins, 50)) {
    await db.batch(group.map((plugin) => db.prepare(
      `UPDATE catalog_repositories
          SET stars = ?, forks = ?, pushed_at = ?, github_updated_at = ?, updated_at = ?
        WHERE normalized_full_name = ?
          AND (stars IS NOT ? OR forks IS NOT ? OR pushed_at IS NOT ? OR github_updated_at IS NOT ?)`,
    ).bind(
      plugin.stars,
      plugin.forks,
      plugin.pushedAt,
      plugin.updatedAt,
      now,
      normalizeRepositoryName(`${plugin.owner}/${plugin.repository}`),
      plugin.stars,
      plugin.forks,
      plugin.pushedAt,
      plugin.updatedAt,
    )))
  }
}

export async function markMissingTopicRepositories(
  db: D1Database,
  runId: string,
  now = new Date().toISOString(),
): Promise<void> {
  await db.prepare(
    `UPDATE catalog_repositories
        SET topic_present = 0, updated_at = ?
      WHERE topic_present = 1
        AND id IN (
          SELECT repository_id FROM catalog_repository_sources
           WHERE source = 'github_topic'
             AND (last_seen_run_id IS NULL OR last_seen_run_id <> ?)
        )`,
  ).bind(now, runId).run()
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

export async function loadCatalogSnapshotFromD1(
  db: D1Database,
  bundledRegistry: Registry,
  now = new Date().toISOString(),
): Promise<StoredCatalogSnapshot | null> {
  const result = await db.prepare(
    `SELECT r.full_name, r.owner, r.repository_name, r.html_url, r.description,
            r.stars, r.forks, r.pushed_at, r.github_updated_at,
            m.display_name, m.category, m.description_en, m.description_zh, m.added
       FROM catalog_repositories r
       LEFT JOIN catalog_metadata m ON m.repository_id = r.id
      WHERE (r.topic_present = 1 AND r.validation_status = 'accepted')
         OR EXISTS (
           SELECT 1 FROM catalog_repository_sources s
            WHERE s.repository_id = r.id AND s.source = 'github_pr'
         )
      ORDER BY r.normalized_full_name`,
  ).all<CatalogRow>()
  if (result.results.length === 0) return null

  const categories = { ...bundledRegistry.categories }
  if (result.results.some((row) => row.category === null)) {
    categories.unclassified = UNCLASSIFIED_CATEGORY
  }
  const plugins = result.results.map<CatalogPlugin>((row) => {
    const description = row.description ?? `${row.full_name} discovered from GitHub.`
    return {
      ...emptyInstallMetrics(),
      name: row.display_name ?? row.repository_name,
      owner: row.owner,
      url: row.html_url,
      repository: row.repository_name,
      category: row.category ?? 'unclassified',
      description: {
        en: row.description_en ?? description,
        zh: row.description_zh ?? description,
      },
      install: `npx @dsh-1024store/cli add ${row.full_name} --profile web`,
      added: row.added ?? (row.github_updated_at ?? now).slice(0, 10),
      stars: row.stars,
      forks: row.forks,
      pushedAt: row.pushed_at,
      updatedAt: row.github_updated_at,
      latestReleaseAt: null,
      growth24h: null,
      growth7d: null,
      growth30d: null,
    }
  })
  const revision = await sha256(JSON.stringify({ categories, plugins }))
  return {
    generatedAt: now,
    registryUpdated: now.slice(0, 10),
    registryRevision: revision,
    metricCoverage: plugins.filter((plugin) => plugin.stars !== null).length,
    categories,
    plugins,
  }
}
