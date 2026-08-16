import type { GitHubRepository, RepositoryInspection } from './github-discovery'
import type { CatalogPlugin, LocalizedText, StoredCatalogSnapshot } from '../types'
import { categoryLabelMap, UNCLASSIFIED_CATEGORY } from './categories'
import { emptyInstallMetrics } from './install-metrics'
import { deriveInstallMethods } from './install-methods'
import type { GitInstallCode, NpmBinding } from './install-methods'
import {
  normalizePluginId,
  parsePluginId,
  pluginInstallCommand,
  pluginPathFromPackagePath,
} from './plugin-id'

interface RepositoryIdentityRow {
  id: number
  github_id: number | null
  normalized_full_name: string
  default_branch: string | null
  pushed_at: string | null
  /** 1 when any of the repository's plugins still needs inspecting. */
  needs_validation: number
}

interface PendingRepositoryRow {
  github_id: number
  full_name: string
  repository_name: string
  html_url: string
  github_description: string | null
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
  github_description: string | null
  stars: number | null
  forks: number | null
  pushed_at: string | null
  github_updated_at: string | null
  plugin_path: string
  plugin_id: string
  curated_name: string | null
  curated_category: string | null
  curated_description_en: string | null
  curated_description_zh: string | null
  curated_added: string | null
  git_code: string | null
  git_has_prepare: number
  git_head_sha: string | null
  git_checked_at: string | null
  npm_package_name: string | null
  npm_binding: string
  npm_bundle_declared: number
  npm_version: string | null
  npm_checked_at: string | null
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

/** Splits a curated entry id into its repository prefix and in-repo path. */
function curatedEntryParts(id: string): { owner: string; name: string; path: string } {
  const parts = parsePluginId(id)
  if (parts === null) throw new Error(`Invalid plugin id: ${id}`)
  return { owner: parts.owner, name: parts.repository, path: parts.path }
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
    `SELECT r.id, r.github_id, r.normalized_full_name, r.default_branch, r.pushed_at,
            EXISTS (
              SELECT 1 FROM catalog_plugins p
               WHERE p.repository_id = r.id
                 AND p.validation_status IN ('pending', 'error')
            ) AS needs_validation
       FROM catalog_repositories r
      WHERE r.github_id IN (${placeholders(ids)})
         OR r.normalized_full_name IN (${placeholders(names)})`,
  ).bind(...ids, ...names).all<RepositoryIdentityRow>()
  const byKey = new Map<string, RepositoryIdentityRow>()
  for (const row of result.results) {
    if (row.github_id !== null) byKey.set(`id:${row.github_id}`, row)
    byKey.set(`name:${row.normalized_full_name}`, row)
  }
  return byKey
}

export interface CuratedCatalogEntry {
  /**
   * Plugin id — `owner/repository`, or `owner/repository/sub/dir` for a
   * monorepo subpackage — matching the curated file name.
   */
  id: string
  name: string
  /** GitHub repository URL. */
  repository: string
  category: string
  description: LocalizedText
  added: string
}

export interface CuratedSyncResult {
  total: number
  removedSources: number
}

/**
 * Full reconciliation of the curated catalog (catalog/plugins/*.json) into D1.
 *
 * Upserts `catalog_repositories` and the curated columns of `catalog_plugins`.
 * A plugin row is per plugin, so several entries may share one repository row
 * (a monorepo contributing more than one subpackage plugin). Entries missing
 * from `entries` lose their curated columns, and a plugin nothing else knows
 * about is removed; repository rows are never deleted, so production data is
 * preserved. Idempotent: re-running with the same input is a no-op apart from
 * `last_seen_at`/`updated_at` bumps.
 */
export async function syncCuratedEntries(
  db: D1Database,
  entries: CuratedCatalogEntry[],
  now = new Date().toISOString(),
): Promise<CuratedSyncResult> {
  // Several entries can share one repository; the repository row is upserted
  // once per distinct owner/repository. Only repository-level facts are touched
  // here — the crawler owns the GitHub columns and this must not disturb them.
  const repositories = new Map<string, { fullName: string; owner: string; name: string; url: string }>()
  for (const entry of entries) {
    const { owner, name } = curatedEntryParts(entry.id)
    const fullName = `${owner}/${name}`
    if (!repositories.has(normalizeRepositoryName(fullName))) {
      repositories.set(normalizeRepositoryName(fullName), { fullName, owner, name, url: entry.repository })
    }
  }

  for (const group of chunks([...repositories.values()], 50)) {
    await db.batch(group.map(({ fullName, owner, name, url }) => db.prepare(
      `INSERT INTO catalog_repositories (
         full_name, normalized_full_name, owner, repository_name, html_url,
         first_seen_at, last_seen_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(normalized_full_name) DO UPDATE SET
         full_name = excluded.full_name,
         owner = excluded.owner,
         repository_name = excluded.repository_name,
         html_url = excluded.html_url,
         last_seen_at = excluded.last_seen_at,
         updated_at = excluded.updated_at`,
    ).bind(fullName, normalizeRepositoryName(fullName), owner, name, url, now, now, now, now)))
  }

  // Retired plugins are dropped BEFORE the upserts. The primary key
  // (repository_id, plugin_path) is case-sensitive while normalized_plugin_id
  // is not, so an entry that only changes the case of its path would insert a
  // second row and trip UNIQUE(normalized_plugin_id) if the stale row were
  // still present. A plugin the topic scan also found keeps its row and simply
  // loses its curated columns.
  const currentPluginIds = JSON.stringify(entries.map((entry) => normalizePluginId(entry.id)))
  const retired = await db.batch([
    db.prepare(
      `DELETE FROM catalog_plugins
        WHERE from_pr = 1
          AND validation_status = 'pending'
          AND normalized_plugin_id NOT IN (SELECT value FROM json_each(?))`,
    ).bind(currentPluginIds),
    db.prepare(
      `UPDATE catalog_plugins
          SET from_pr = 0, pr_reference = NULL,
              curated_name = NULL, curated_category = NULL,
              curated_description_en = NULL, curated_description_zh = NULL,
              curated_added = NULL, curated_updated_at = NULL,
              updated_at = ?
        WHERE from_pr = 1
          AND normalized_plugin_id NOT IN (SELECT value FROM json_each(?))`,
    ).bind(now, currentPluginIds),
  ])

  for (const group of chunks(entries, 40)) {
    const normalizedNames = [...new Set(group.map((entry) => {
      const { owner, name } = curatedEntryParts(entry.id)
      return normalizeRepositoryName(`${owner}/${name}`)
    }))]
    const result = await db.prepare(
      `SELECT id, normalized_full_name
         FROM catalog_repositories
        WHERE normalized_full_name IN (${normalizedNames.map(() => '?').join(', ')})`,
    ).bind(...normalizedNames).all<{ id: number; normalized_full_name: string }>()
    const ids = new Map(result.results.map((row) => [row.normalized_full_name, row.id]))
    const statements: D1PreparedStatement[] = []
    for (const entry of group) {
      const { owner, name, path } = curatedEntryParts(entry.id)
      const id = ids.get(normalizeRepositoryName(`${owner}/${name}`))
      if (id === undefined) throw new Error(`Curated repository was not inserted: ${entry.id}`)
      statements.push(db.prepare(
        // Only curated_* and the provenance flag are written. The crawler's
        // columns are absent from both the insert and the update, so a sync
        // never overwrites install facts it did not produce.
        `INSERT INTO catalog_plugins (
           repository_id, plugin_id, normalized_plugin_id, plugin_path,
           from_pr, pr_reference,
           curated_name, curated_category, curated_description_en, curated_description_zh,
           curated_added, curated_updated_at,
           first_seen_at, last_seen_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(repository_id, plugin_path) DO UPDATE SET
           plugin_id = excluded.plugin_id,
           normalized_plugin_id = excluded.normalized_plugin_id,
           from_pr = 1,
           pr_reference = excluded.pr_reference,
           curated_name = excluded.curated_name,
           curated_category = excluded.curated_category,
           curated_description_en = excluded.curated_description_en,
           curated_description_zh = excluded.curated_description_zh,
           curated_added = excluded.curated_added,
           curated_updated_at = excluded.curated_updated_at,
           last_seen_at = excluded.last_seen_at,
           updated_at = excluded.updated_at`,
      ).bind(
        id, entry.id, normalizePluginId(entry.id), path,
        entry.repository,
        entry.name, entry.category, entry.description.en, entry.description.zh,
        entry.added, now,
        now, now, now, now,
      ))
    }
    await db.batch(statements)
  }

  return {
    total: entries.length,
    removedSources: Number(retired[0]?.meta.changes ?? 0) + Number(retired[1]?.meta.changes ?? 0),
  }
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
        `UPDATE catalog_repositories
            SET from_topic = MAX(from_topic, (SELECT from_topic FROM catalog_repositories WHERE id = ?)),
                topic_last_run_id = COALESCE(
                  (SELECT topic_last_run_id FROM catalog_repositories WHERE id = ?), topic_last_run_id),
                topic_last_seen_at = COALESCE(
                  (SELECT topic_last_seen_at FROM catalog_repositories WHERE id = ?), topic_last_seen_at)
          WHERE id = ?`,
      ).bind(byGithubId.id, byGithubId.id, byGithubId.id, byName.id),
      // Plugin ids are globally unique, so the losing rows go before the copy
      // lands. Ids are rebuilt around the surviving repository's name.
      db.prepare(
        `DELETE FROM catalog_plugins
          WHERE repository_id = ?
            AND plugin_path IN (SELECT plugin_path FROM catalog_plugins WHERE repository_id = ?)`,
      ).bind(byName.id, byGithubId.id),
      db.prepare(
        `INSERT INTO catalog_plugins (
           repository_id, plugin_id, normalized_plugin_id, plugin_path,
           from_pr, pr_reference,
           curated_name, curated_category, curated_description_en, curated_description_zh,
           curated_added, curated_updated_at,
           manifest_path, package_name, package_version, bundle_patch,
           validation_status, validation_code, validation_reason,
           first_seen_at, last_seen_at, created_at, updated_at
         )
         SELECT ?, r.full_name || CASE WHEN p.plugin_path = '' THEN '' ELSE '/' || p.plugin_path END,
                lower(r.normalized_full_name || CASE WHEN p.plugin_path = '' THEN '' ELSE '/' || p.plugin_path END),
                p.plugin_path,
                p.from_pr, p.pr_reference,
                p.curated_name, p.curated_category, p.curated_description_en, p.curated_description_zh,
                p.curated_added, p.curated_updated_at,
                p.manifest_path, p.package_name, p.package_version, p.bundle_patch,
                p.validation_status, p.validation_code, p.validation_reason,
                p.first_seen_at, p.last_seen_at, p.created_at, p.updated_at
           FROM catalog_plugins p
           JOIN catalog_repositories r ON r.id = ?
          WHERE p.repository_id = ?
         ON CONFLICT(repository_id, plugin_path) DO NOTHING`,
      ).bind(byName.id, byName.id, byGithubId.id),
      // Cascades the losing repository's remaining plugin rows away.
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
      existing.needs_validation === 1
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
      needsValidation: changed ? 1 : 0,
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
           json_extract(value, '$.pushedAt') AS pushed_at
         FROM json_each(?)
         WHERE json_extract(value, '$.internalId') IS NOT NULL
       )
       UPDATE catalog_repositories
          SET (github_id, full_name, normalized_full_name, owner, repository_name,
               html_url, github_description, default_branch, stars, forks, language, license,
               github_updated_at, pushed_at, from_topic,
               last_seen_at, updated_at) =
              (SELECT github_id, full_name, normalized_full_name, owner, repository_name,
                      html_url, description, default_branch, stars, forks, language, license,
                      github_updated_at, pushed_at, 1, ?, ?
                 FROM incoming WHERE internal_id = catalog_repositories.id)
        WHERE id IN (SELECT internal_id FROM incoming)`,
    ).bind(serialized, now, now).run()
  }

  if (newCount > 0) {
    await db.prepare(
      `INSERT INTO catalog_repositories (
         github_id, full_name, normalized_full_name, owner, repository_name, html_url,
         github_description, default_branch, stars, forks, language, license, github_updated_at,
         pushed_at, from_topic, first_seen_at, last_seen_at,
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
         json_extract(value, '$.pushedAt'), 1, ?, ?, ?, ?
       FROM json_each(?)
       WHERE json_extract(value, '$.internalId') IS NULL`,
    ).bind(now, now, now, now, serialized).run()
  }

  // The topic provenance is a column now, and every discovered repository needs
  // a plugin row for the validation queue to have something to inspect. The
  // plugin sits at the repository root until inspection finds a nested manifest;
  // an existing row (curated, or from an earlier scan) is left alone.
  await db.batch([
    db.prepare(
      `UPDATE catalog_repositories
          SET from_topic = 1, topic_last_run_id = ?, topic_last_seen_at = ?, updated_at = ?
        WHERE normalized_full_name IN (
          SELECT json_extract(value, '$.normalizedName') FROM json_each(?)
        )`,
    ).bind(runId, now, now, serialized),
    db.prepare(
      `INSERT INTO catalog_plugins (
         repository_id, plugin_id, normalized_plugin_id, plugin_path,
         first_seen_at, last_seen_at, created_at, updated_at
       )
       SELECT r.id, r.full_name, r.normalized_full_name, '', ?, ?, ?, ?
         FROM json_each(?) j
         JOIN catalog_repositories r
           ON r.normalized_full_name = json_extract(j.value, '$.normalizedName')
       ON CONFLICT(repository_id, plugin_path) DO NOTHING`,
    ).bind(now, now, now, now, serialized),
  ])

  return { changedCount }
}

export async function loadPendingValidationRepositories(
  db: D1Database,
  limit = 20,
): Promise<GitHubRepository[]> {
  const result = await db.prepare(
    `SELECT github_id, full_name, repository_name, html_url, github_description, default_branch,
            stars, forks, language, license, github_updated_at, pushed_at
       FROM catalog_repositories
      WHERE github_id IS NOT NULL
        AND from_topic = 1
        AND EXISTS (
          SELECT 1 FROM catalog_plugins p
           WHERE p.repository_id = catalog_repositories.id
             AND p.validation_status = 'pending'
        )
      ORDER BY last_scanned_at IS NOT NULL, last_scanned_at, id
      LIMIT ?`,
  ).bind(limit).all<PendingRepositoryRow>()
  return result.results.map((row) => ({
    id: row.github_id,
    name: row.repository_name,
    full_name: row.full_name,
    html_url: row.html_url,
    description: row.github_description,
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
  headSha: string | null = null,
): Promise<void> {
  if (inspections.length === 0) return
  const statements: D1PreparedStatement[] = []
  for (const inspection of inspections) {
    // The manifest's directory is where the plugin actually lives. A discovered
    // repository starts with one plugin row at the root; when inspection finds
    // the bundle nested, the row moves there so the install spec carries
    // `#path:` instead of pointing at a root that has no bundle. The move is
    // skipped when a curated plugin already occupies that path — that row is
    // the same plugin and already carries better metadata.
    const pluginPath = pluginPathFromPackagePath(inspection.package?.path ?? null)
    statements.push(
      db.prepare(
        `UPDATE catalog_plugins
            SET plugin_path = ?,
                plugin_id = (SELECT r.full_name FROM catalog_repositories r WHERE r.id = repository_id)
                            || CASE WHEN ? = '' THEN '' ELSE '/' || ? END,
                normalized_plugin_id = lower(
                  (SELECT r.normalized_full_name FROM catalog_repositories r WHERE r.id = repository_id)
                  || CASE WHEN ? = '' THEN '' ELSE '/' || ? END
                ),
                updated_at = ?
          WHERE plugin_path = ''
            AND ? <> ''
            AND repository_id = (SELECT id FROM catalog_repositories WHERE github_id = ?)
            AND NOT EXISTS (
              SELECT 1 FROM catalog_plugins other
               WHERE other.repository_id = catalog_plugins.repository_id
                 AND other.plugin_path = ?
            )`,
      ).bind(pluginPath, pluginPath, pluginPath, pluginPath, pluginPath, now, pluginPath,
        inspection.githubId, pluginPath),
      db.prepare(
        `UPDATE catalog_plugins SET
           validation_status = ?, validation_code = ?, validation_reason = ?,
           package_name = ?, package_version = ?, manifest_path = ?, bundle_patch = ?,
           git_entry_point = ?, git_entry_committed = ?, git_has_prepare = ?,
           git_status = ?, git_code = ?, git_head_sha = ?, git_checked_at = ?,
           updated_at = ?
         WHERE repository_id = (SELECT id FROM catalog_repositories WHERE github_id = ?)
           AND plugin_path = ?`,
      ).bind(
        inspection.status,
        inspection.code,
        inspection.reason,
        inspection.package?.name ?? null,
        inspection.package?.version ?? null,
        inspection.package?.path ?? null,
        inspection.package?.patch ?? null,
        inspection.package?.entryPoint ?? null,
        inspection.package?.entryCommitted ? 1 : 0,
        inspection.package?.hasPrepare ? 1 : 0,
        // A rejected repository has no manifest to judge, so the git method
        // stays unknown rather than being called broken.
        inspection.package ? 'ok' : 'error',
        inspection.package?.gitCode ?? null,
        headSha ?? null,
        now,
        now,
        inspection.githubId,
        pluginPath,
      ),
      // last_scanned_at stays a repository fact: it paces the crawler.
      db.prepare(
        'UPDATE catalog_repositories SET last_scanned_at = ?, updated_at = ? WHERE github_id = ?',
      ).bind(now, now, inspection.githubId),
    )
  }
  await db.batch(statements)
}

export async function saveCatalogMetrics(
  db: D1Database,
  plugins: CatalogPlugin[],
  now = new Date().toISOString(),
): Promise<void> {
  if (plugins.length === 0) return
  // Stars and forks are repository facts: sibling plugins of one monorepo would
  // otherwise issue identical UPDATEs in the same batch.
  const byRepository = new Map<string, CatalogPlugin>()
  for (const plugin of plugins) {
    const key = normalizeRepositoryName(`${plugin.owner}/${plugin.repository}`)
    if (!byRepository.has(key)) byRepository.set(key, plugin)
  }
  for (const group of chunks([...byRepository.values()], 50)) {
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
        SET from_topic = 0, updated_at = ?
      WHERE from_topic = 1
        AND (topic_last_run_id IS NULL OR topic_last_run_id <> ?)`,
  ).bind(now, runId).run()
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

export async function loadCatalogSnapshotFromD1(
  db: D1Database,
  now = new Date().toISOString(),
): Promise<StoredCatalogSnapshot | null> {
  // A repository with curated metadata contributes one plugin per metadata row
  // (a monorepo may contribute several); a topic-only repository contributes
  // exactly one plugin, located at its accepted manifest's directory.
  const result = await db.prepare(
    `SELECT r.full_name, r.owner, r.repository_name, r.html_url, r.github_description,
            r.stars, r.forks, r.pushed_at, r.github_updated_at,
            p.plugin_path, p.plugin_id,
            p.curated_name, p.curated_category,
            p.curated_description_en, p.curated_description_zh, p.curated_added,
            p.git_code, p.git_has_prepare, p.git_head_sha, p.git_checked_at,
            p.npm_package_name, p.npm_binding, p.npm_bundle_declared,
            p.npm_version, p.npm_checked_at
       FROM catalog_plugins p
       JOIN catalog_repositories r ON r.id = p.repository_id
      WHERE p.from_pr = 1
         OR (r.from_topic = 1 AND p.validation_status = 'accepted')
      ORDER BY r.normalized_full_name, p.plugin_path`,
  ).all<CatalogRow>()
  if (result.results.length === 0) return null

  const categories = categoryLabelMap()
  if (result.results.some((row) => row.curated_category === null)) {
    categories[UNCLASSIFIED_CATEGORY.id] = { ...UNCLASSIFIED_CATEGORY.label }
  }
  const plugins = result.results.map<CatalogPlugin>((row) => {
    const description = row.github_description ?? `${row.full_name} discovered from GitHub.`
    // The plugin row owns its id: inspection moves a discovered plugin to its
    // manifest's directory, so a nested monorepo bundle yields the `#path:`
    // install spec pnpm needs instead of a broken repository-root one.
    const id = row.plugin_id
    return {
      ...emptyInstallMetrics(),
      id,
      name: row.curated_name ?? row.repository_name,
      owner: row.owner,
      url: row.html_url,
      repository: row.repository_name,
      category: row.curated_category ?? UNCLASSIFIED_CATEGORY.id,
      description: {
        en: row.curated_description_en ?? description,
        zh: row.curated_description_zh ?? description,
      },
      install: pluginInstallCommand(id),
      // Facts in, verdicts out: the badge is derived here rather than stored,
      // so changing how a fact is judged is a deploy, not a re-crawl.
      installMethods: deriveInstallMethods(
        id,
        {
          code: (row.git_code as GitInstallCode | null) ?? 'not_checked',
          hasPrepare: row.git_has_prepare === 1,
          headSha: row.git_head_sha,
          checkedAt: row.git_checked_at,
        },
        row.npm_package_name === null ? null : {
          packageName: row.npm_package_name,
          binding: row.npm_binding as NpmBinding,
          bundleDeclared: row.npm_bundle_declared === 1,
          version: row.npm_version,
          checkedAt: row.npm_checked_at,
        },
      ),
      added: row.curated_added ?? (row.github_updated_at ?? now).slice(0, 10),
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

export interface NpmProbeCandidate {
  pluginId: string
  packageName: string
}

/**
 * Plugins whose npm binding is stale or unknown, oldest first.
 *
 * Only published plugins are probed, and only those whose own manifest named a
 * package — the name comes from the repository, never from a guess.
 */
export async function loadPendingNpmProbes(
  db: D1Database,
  limit = 60,
  staleBefore: string | null = null,
): Promise<NpmProbeCandidate[]> {
  const result = await db.prepare(
    `SELECT p.plugin_id, p.package_name
       FROM catalog_plugins p
       JOIN catalog_repositories r ON r.id = p.repository_id
      WHERE p.package_name IS NOT NULL
        AND (p.from_pr = 1 OR (r.from_topic = 1 AND p.validation_status = 'accepted'))
        AND (p.npm_status = 'pending' OR p.npm_checked_at IS NULL OR p.npm_checked_at < ?)
      ORDER BY p.npm_checked_at IS NOT NULL, p.npm_checked_at
      LIMIT ?`,
  ).bind(staleBefore ?? '', limit).all<{ plugin_id: string; package_name: string }>()
  return result.results.map((row) => ({ pluginId: row.plugin_id, packageName: row.package_name }))
}

export interface NpmProbeRecord {
  pluginId: string
  packageName: string
  status: 'found' | 'absent' | 'error'
  httpStatus: number | null
  version: string | null
  repositoryUrl: string | null
  repositoryDirectory: string | null
  bundleDeclared: boolean
  entryPoint: string | null
  tarballUrl: string | null
  integrity: string | null
  binding: string
}

/**
 * Records npm probe results.
 *
 * An `error` result updates only the bookkeeping columns: one registry outage
 * must not flip thousands of badges from verified to unverified. A `found` or
 * `absent` result is a real observation and replaces the previous one.
 */
export async function saveNpmProbes(
  db: D1Database,
  probes: NpmProbeRecord[],
  now = new Date().toISOString(),
): Promise<void> {
  if (probes.length === 0) return
  for (const group of chunks(probes, 40)) {
    await db.batch(group.map((probe) => (probe.status === 'error'
      ? db.prepare(
        `UPDATE catalog_plugins
            SET npm_status = 'error', npm_http_status = ?, npm_checked_at = ?, updated_at = ?
          WHERE normalized_plugin_id = ?`,
      ).bind(probe.httpStatus, now, now, normalizePluginId(probe.pluginId))
      : db.prepare(
        `UPDATE catalog_plugins
            SET npm_package_name = ?, npm_status = ?, npm_http_status = ?,
                npm_version = ?, npm_repository_url = ?, npm_repository_directory = ?,
                npm_bundle_declared = ?, npm_binding = ?,
                npm_checked_at = ?, updated_at = ?
          WHERE normalized_plugin_id = ?`,
      ).bind(
        probe.packageName, probe.status, probe.httpStatus,
        probe.version, probe.repositoryUrl, probe.repositoryDirectory,
        probe.bundleDeclared ? 1 : 0, probe.binding,
        now, now, normalizePluginId(probe.pluginId),
      ))))
  }
}

/**
 * Fills in the GitHub facts for repositories that arrived through a submission.
 *
 * A submission gives us a name and nothing else, so those rows land with
 * `github_id` NULL — and the validation queue keys on `github_id`. Until this
 * runs, a curated plugin is published without anything ever inspecting it,
 * which is exactly how the catalog came to serve install commands that cannot
 * work. One request per repository, once.
 *
 * @returns how many repositories were hydrated.
 */
export async function hydrateCuratedRepositories(
  db: D1Database,
  client: { request: <T>(path: string) => Promise<T> },
  limit = 20,
  now = new Date().toISOString(),
): Promise<number> {
  const pending = await db.prepare(
    `SELECT r.id, r.full_name
       FROM catalog_repositories r
      WHERE r.github_id IS NULL
        AND EXISTS (SELECT 1 FROM catalog_plugins p WHERE p.repository_id = r.id AND p.from_pr = 1)
      ORDER BY r.id
      LIMIT ?`,
  ).bind(limit).all<{ id: number; full_name: string }>()
  if (pending.results.length === 0) return 0

  let hydrated = 0
  for (const row of pending.results) {
    const encoded = row.full_name.split('/').map(encodeURIComponent).join('/')
    let repository: GitHubRepository
    try {
      repository = await client.request<GitHubRepository>(`/repos/${encoded}`)
    } catch {
      // A renamed or deleted repository must not stall the queue behind it; the
      // next run tries again, and the plugin stays published meanwhile.
      continue
    }
    await db.prepare(
      `UPDATE catalog_repositories
          SET github_id = ?, github_description = ?, default_branch = ?, stars = ?, forks = ?,
              language = ?, license = ?, github_updated_at = ?, pushed_at = ?, updated_at = ?
        WHERE id = ?`,
    ).bind(
      repository.id, repository.description, repository.default_branch,
      repository.stargazers_count, repository.forks_count, repository.language,
      repository.license?.spdx_id ?? null, repository.updated_at, repository.pushed_at,
      now, row.id,
    ).run()
    hydrated += 1
  }
  return hydrated
}
