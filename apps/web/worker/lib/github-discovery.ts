import type { GitInstallCode } from './install-methods'
import { buildPluginId, PLUGIN_ID_MAX_LENGTH, pluginPathFromPackagePath } from './plugin-id'
const GITHUB_API = 'https://api.github.com'
const SEARCH_RESULT_LIMIT = 1000
const FIRST_GITHUB_INSTANT = '2008-01-01T00:00:00Z'
/**
 * Manifest blobs one pass may read from a single repository.
 *
 * This used to be `MAX_PACKAGE_MANIFESTS = 25` applied as a bare `.slice()`,
 * which silently discarded every manifest past the 25th — a 37-package
 * monorepo lost 12 plugins with no counter, no log and no rejection code to
 * show for it. It is a per-pass budget now: what does not fit is resumed from
 * `nextManifestCursor` on the next pass instead of vanishing.
 */
const MANIFEST_BLOB_BUDGET = 60
const BLOB_RETRY_ATTEMPTS = 3
const DEFAULT_EXCLUSIONS = new Set(['deepseek-ai/deepseek-harness'])
export const DISCOVERY_STRATEGY_VERSION = 'created-pushed-v1'

type JsonObject = Record<string, unknown>

export interface GitHubRepository {
  id: number
  name: string
  full_name: string
  html_url: string
  description: string | null
  fork: boolean
  archived: boolean
  disabled: boolean
  default_branch: string
  stargazers_count: number
  forks_count: number
  language: string | null
  license: { spdx_id: string | null } | null
  updated_at: string
  pushed_at: string | null
}

interface SearchResponse {
  total_count: number
  incomplete_results: boolean
  items: GitHubRepository[]
}

interface GitTreeEntry {
  path: string
  mode: string
  type: 'blob' | 'tree' | 'commit'
  sha: string
}

interface GitTreeResponse {
  truncated: boolean
  tree: GitTreeEntry[]
}

interface GitBlobResponse {
  encoding: string
  content: string
}

export interface InspectedPackage {
  name: string
  version: string | null
  path: string
  patch: string
  /**
   * What a git install of this manifest would produce. Same rules as the
   * submission gate (scripts/review-plugin-submission.mjs classifyGitInstall)
   * and the same vocabulary the badge derives from — the two must agree or
   * the pull-request advisory contradicts the published label.
   */
  entryPoint: string | null
  entryCommitted: boolean
  hasPrepare: boolean
  gitCode: GitInstallCode
}

export interface RepositoryInspection {
  githubId: number
  /**
   * `accepted` when this pass found at least one bundle, `rejected` when the
   * sweep finished without one, `pending` when the budget ran out before the
   * sweep could reach a verdict. Only a finished sweep may retire plugins, so
   * the three are not interchangeable.
   */
  status: 'accepted' | 'rejected' | 'pending'
  code: string | null
  reason: string | null
  /** Every manifest in this pass that declares a usable `dsh.bundle`. */
  packages: InspectedPackage[]
  /**
   * Whether this pass opened a fresh sweep rather than resuming one. The
   * caller stamps the sweep when it does, so it can tell at the end which
   * plugin rows the sweep never touched.
   */
  sweepRestarted: boolean
  /**
   * The last manifest path this pass read, for the next pass to resume after,
   * or `null` when this pass reached the end of the tree. A repository is only
   * reconciled — vanished plugins retired, cursor cleared — once this is
   * `null`.
   */
  nextManifestCursor: string | null
}

export class GitHubApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly apiPath: string,
    message: string,
    public readonly rateLimitRemaining: number | null,
    public readonly rateLimitReset: number | null,
  ) {
    super(`GitHub API ${status} for ${apiPath}: ${message}`)
    this.name = 'GitHubApiError'
  }
}

export class RepositoryRejection extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'RepositoryRejection'
  }
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseIntegerHeader(value: string | null): number | null {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : null
}

export function createGitHubClient(
  token: string,
  fetcher: typeof fetch = fetch,
  searchWaiter: (milliseconds: number) => Promise<unknown> = (milliseconds) =>
    scheduler.wait(milliseconds),
) {
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'dsh-1024store-cloudflare-discovery',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  let madeSearchRequest = false
  let rateLimitRemaining: number | null = null

  return {
    async request<T>(apiPath: string, search = false): Promise<T> {
      if (search && madeSearchRequest) await searchWaiter(2_100)
      if (search) madeSearchRequest = true
      const response = await fetcher(`${GITHUB_API}${apiPath}`, {
        headers,
        signal: AbortSignal.timeout(30_000),
      })
      const text = await response.text()
      rateLimitRemaining = parseIntegerHeader(response.headers.get('x-ratelimit-remaining'))
      if (!response.ok) {
        let message = text.slice(0, 500)
        try {
          const parsed: unknown = JSON.parse(text)
          if (isObject(parsed) && typeof parsed.message === 'string') message = parsed.message
        } catch {
          // Preserve the response body when GitHub did not return JSON.
        }
        throw new GitHubApiError(
          response.status,
          apiPath,
          message,
          rateLimitRemaining,
          parseIntegerHeader(response.headers.get('x-ratelimit-reset')),
        )
      }
      return JSON.parse(text) as T
    },
    getRateLimitRemaining(): number | null {
      return rateLimitRemaining
    },
  }
}

export type GitHubClient = ReturnType<typeof createGitHubClient>

function isoSecond(value: Date): string {
  return value.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function instantBefore(value: string): string {
  return isoSecond(new Date(new Date(value).getTime() - 1_000))
}

function instantAfter(value: string): string {
  return isoSecond(new Date(new Date(value).getTime() + 1_000))
}

function midpoint(start: string, end: string): string {
  const left = new Date(start).getTime()
  const right = new Date(end).getTime()
  return isoSecond(new Date(left + Math.floor((right - left) / 2_000) * 1_000))
}

type SearchDateQualifier = 'created' | 'pushed'

function searchQuery(topic: string, qualifier: SearchDateQualifier, start: string, end: string): string {
  return [`topic:${topic}`, 'fork:false', 'archived:false', `${qualifier}:${start}..${end}`].join(' ')
}

async function searchPage(
  client: GitHubClient,
  topic: string,
  qualifier: SearchDateQualifier,
  start: string,
  end: string,
  page: number,
): Promise<SearchResponse> {
  const parameters = new URLSearchParams({
    q: searchQuery(topic, qualifier, start, end),
    // Repository Search only documents `updated` (plus stars/forks/help-wanted)
    // as a sort key. The date qualifier still controls the created/pushed range.
    sort: 'updated',
    order: 'desc',
    per_page: '100',
    page: String(page),
  })
  const response = await client.request<SearchResponse>(`/search/repositories?${parameters}`, true)
  if (!Number.isInteger(response.total_count) || !Array.isArray(response.items)) {
    throw new Error('GitHub repository search returned an invalid response')
  }
  if (response.incomplete_results) {
    throw new Error(`GitHub repository search was incomplete for ${qualifier}:${start}..${end}`)
  }
  return response
}

async function collectRange(
  client: GitHubClient,
  topic: string,
  qualifier: SearchDateQualifier,
  start: string,
  end: string,
): Promise<GitHubRepository[]> {
  const first = await searchPage(client, topic, qualifier, start, end, 1)
  if (first.total_count > SEARCH_RESULT_LIMIT) {
    if (start === end) {
      throw new Error(`GitHub Search has more than ${SEARCH_RESULT_LIMIT} results at ${qualifier}:${start}`)
    }
    const center = midpoint(start, end)
    if (center === start || center === end) {
      throw new Error(`GitHub Search range cannot be split further: ${qualifier}:${start}..${end}`)
    }
    const left = await collectRange(client, topic, qualifier, start, center)
    const right = await collectRange(client, topic, qualifier, instantAfter(center), end)
    return [...left, ...right]
  }

  const items = [...first.items]
  const pages = Math.ceil(first.total_count / 100)
  for (let page = 2; page <= pages; page += 1) {
    const response = await searchPage(client, topic, qualifier, start, end, page)
    items.push(...response.items)
  }
  return items
}

function uniqueRepositories(repositories: GitHubRepository[]): GitHubRepository[] {
  const unique = new Map<number, GitHubRepository>()
  for (const repository of repositories) unique.set(repository.id, repository)
  return [...unique.values()].sort((left, right) => left.id - right.id)
}

export async function discoverRepositories(
  client: GitHubClient,
  topic: string,
  mode: 'incremental' | 'full',
  start: string | null,
  end: string,
): Promise<GitHubRepository[]> {
  const rangeStart = mode === 'full' ? FIRST_GITHUB_INSTANT : start
  if (rangeStart === null) throw new Error('Incremental discovery requires a watermark')
  if (mode === 'full') {
    return uniqueRepositories(await collectRange(client, topic, 'created', rangeStart, end))
  }

  // GitHub repository search does not support an `updated:` qualifier. Query
  // both supported signals so newly-created repositories and existing plugins
  // with fresh pushes are discovered, then deduplicate repositories present in
  // both result sets. The weekly full scan remains the safety net for an old
  // repository that only adds/removes the topic without a push.
  const created = await collectRange(client, topic, 'created', rangeStart, end)
  const pushed = await collectRange(client, topic, 'pushed', rangeStart, end)
  return uniqueRepositories([...created, ...pushed])
}

export function selectDiscoveryMode(
  requestedMode: 'incremental' | 'full' | undefined,
  watermark: string | null,
  strategyVersion: string | null,
): 'incremental' | 'full' {
  if (requestedMode === 'full' || watermark === null) return 'full'
  if (requestedMode === 'incremental') return 'incremental'
  return strategyVersion === DISCOVERY_STRATEGY_VERSION ? 'incremental' : 'full'
}

/** `__NAME__`-style placeholders left in a scaffold's package name. */
const SCAFFOLD_PLACEHOLDER = /__[A-Za-z0-9]+__/

function decodeBlob(blob: GitBlobResponse, label: string): string {
  if (blob.encoding !== 'base64' || typeof blob.content !== 'string') {
    throw new RepositoryRejection('unreadable_file', `${label} is not a readable blob`)
  }
  const binary = atob(blob.content.replaceAll('\n', ''))
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function resolvePatchPath(manifestPath: string, patch: unknown): string {
  if (typeof patch !== 'string' || patch.trim().length === 0 || patch.includes('\\')) {
    throw new RepositoryRejection('invalid_bundle_patch', 'dsh.bundle.patch must be a relative POSIX path')
  }
  const packageDirectory = manifestPath.includes('/')
    ? manifestPath.slice(0, manifestPath.lastIndexOf('/'))
    : ''
  const parts = `${packageDirectory}/${patch.trim()}`.split('/')
  const resolved: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (resolved.length === 0) {
        throw new RepositoryRejection('invalid_bundle_patch', 'dsh.bundle.patch points outside the repository')
      }
      resolved.pop()
    } else {
      resolved.push(part)
    }
  }
  if (resolved.length === 0) {
    throw new RepositoryRejection('invalid_bundle_patch', 'dsh.bundle.patch does not identify a file')
  }
  return resolved.join('/')
}

/**
 * The entry point a git install has to import: `exports["."]` wins over `main`.
 * Undefined when the manifest declares none — Node would fall back to
 * index.js, but a bundle may load purely through its patch, so an undeclared
 * entry is not evidence of a defect.
 */
function declaredEntryPoint(manifest: Record<string, unknown>): string | undefined {
  const exported = manifest.exports
  if (typeof exported === 'string') return exported
  if (isObject(exported)) {
    const root = exported['.']
    if (typeof root === 'string') return root
    if (isObject(root)) {
      for (const condition of ['default', 'import', 'node', 'require']) {
        const value = root[condition]
        if (typeof value === 'string') return value
      }
    }
  }
  return typeof manifest.main === 'string' ? manifest.main : undefined
}

/**
 * pnpm runs `prepare` after a git install and otherwise ships only committed
 * files, so a plugin whose entry point is a build artifact produced at
 * npm-publish time installs cleanly and then fails at startup. A committed
 * entry wins the loadability verdict; independently, any `prepare` script adds
 * pnpm's `--allow-build=<package-name>` option to the generated install command.
 */
function classifyGitInstall(
  manifest: Record<string, unknown>,
  manifestPath: string,
  treePaths: Set<string>,
): { entryPoint: string | null; entryCommitted: boolean; hasPrepare: boolean; gitCode: GitInstallCode } {
  const scripts = isObject(manifest.scripts) ? manifest.scripts : null
  const prepare = scripts?.prepare
  const hasPrepare = typeof prepare === 'string' && prepare.trim().length > 0
  const entry = declaredEntryPoint(manifest)
  if (entry === undefined) {
    return { entryPoint: null, entryCommitted: false, hasPrepare, gitCode: 'no_entry_declared' }
  }
  let entryPath: string
  try {
    entryPath = resolvePatchPath(manifestPath, entry)
  } catch {
    return { entryPoint: entry, entryCommitted: false, hasPrepare, gitCode: 'entry_outside_repository' }
  }
  if (treePaths.has(entryPath)) {
    return { entryPoint: entry, entryCommitted: true, hasPrepare, gitCode: 'entry_committed' }
  }
  return {
    entryPoint: entry,
    entryCommitted: false,
    hasPrepare,
    gitCode: hasPrepare ? 'prepare_builds_entry' : 'entry_missing_no_prepare',
  }
}

function validateManifest(
  source: string,
  manifestPath: string,
  treePaths: Set<string>,
  repositoryFullName: string,
) {
  let manifest: unknown
  try {
    manifest = JSON.parse(source)
  } catch {
    throw new RepositoryRejection('invalid_package', `${manifestPath} is invalid JSON`)
  }
  if (!isObject(manifest) || typeof manifest.name !== 'string' || manifest.name.trim() === '') {
    throw new RepositoryRejection('invalid_package', `${manifestPath} does not declare a package name`)
  }
  // Scaffolds declare a bundle so `dsh plugin add` can be demonstrated against
  // them, but `@scope/thing-__NAME__` is a placeholder nobody can install. It
  // only became reachable once the sweep stopped stopping at the first bundle.
  if (SCAFFOLD_PLACEHOLDER.test(manifest.name)) {
    throw new RepositoryRejection('scaffold_template', `${manifestPath} is a scaffold template, not a plugin`)
  }
  const dsh = isObject(manifest.dsh) ? manifest.dsh : null
  const bundle = dsh && isObject(dsh.bundle) ? dsh.bundle : null
  if (!bundle) throw new RepositoryRejection('missing_bundle', `${manifestPath} does not declare dsh.bundle`)
  const patch = resolvePatchPath(manifestPath, bundle.patch)
  if (!treePaths.has(patch)) {
    throw new RepositoryRejection('missing_bundle_patch', `${patch} does not exist on the default branch`)
  }
  // A plugin is addressed by its id, so a manifest whose directory an id cannot
  // carry is not installable and must not be published.
  //
  // pluginPathFromPackagePath answers '' for two very different things: a
  // manifest at the repository root, and a directory no plugin id can represent
  // (a segment outside [A-Za-z0-9_.-], or a path too long). Treating the second
  // as the first silently files the package against the repository-root plugin
  // row — every such manifest in the repository collapsing onto the same row,
  // last one winning, published under an install spec that installs something
  // else entirely. It only became reachable once the sweep stopped stopping at
  // the first bundle it found.
  //
  // The length bound has to be re-checked here too: pluginPathFromPackagePath
  // measures the directory against a 17-character `owner/repository/` stand-in,
  // while the id this row will actually carry is built from the real repository
  // name. An id over the cap is one parsePluginId rejects, and the install
  // command it yields has lost its `#path:` separator.
  const pluginPath = pluginPathFromPackagePath(manifestPath)
  if (pluginPath === '' && manifestPath !== 'package.json') {
    throw new RepositoryRejection(
      'unrepresentable_plugin_path',
      `${manifestPath} is in a directory a plugin id cannot represent`,
    )
  }
  const pluginId = buildPluginId(repositoryFullName, pluginPath)
  if (pluginId.length > PLUGIN_ID_MAX_LENGTH) {
    throw new RepositoryRejection(
      'plugin_id_too_long',
      `${pluginId.length} characters exceeds the ${PLUGIN_ID_MAX_LENGTH}-character plugin id limit`,
    )
  }
  return {
    name: manifest.name.trim(),
    version: typeof manifest.version === 'string' && manifest.version.trim() !== ''
      ? manifest.version.trim()
      : null,
    path: manifestPath,
    patch,
    ...classifyGitInstall(manifest, manifestPath, treePaths),
  }
}

function rejection(repository: GitHubRepository, error: RepositoryRejection): RepositoryInspection {
  return {
    githubId: repository.id,
    status: 'rejected',
    code: error.code,
    reason: error.message,
    packages: [],
    // A repository-level rejection is a finished verdict: there is nothing
    // left to resume, so the caller may reconcile and clear the cursor.
    sweepRestarted: true,
    nextManifestCursor: null,
  }
}

/**
 * Whether re-issuing this request could plausibly succeed.
 *
 * A 404 or a 422 is a fact about the repository and retrying it three times
 * only spends rate limit; a 5xx or a dropped socket is worth another attempt.
 */
function isTransient(error: unknown): boolean {
  if (!(error instanceof GitHubApiError)) return true
  return error.status >= 500 || error.status === 429
}

async function requestWithRetry<T>(
  client: GitHubClient,
  apiPath: string,
  waiter: (milliseconds: number) => Promise<unknown>,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < BLOB_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await client.request<T>(apiPath)
    } catch (error) {
      // Retrying here rather than around the whole repository is the point: a
      // single flaky blob used to re-fetch the tree and every manifest before
      // it, so the wasted work grew with the number of packages a monorepo has.
      if (!isTransient(error)) throw error
      lastError = error
      if (attempt < BLOB_RETRY_ATTEMPTS - 1) await waiter(1_000 * 2 ** attempt)
    }
  }
  throw lastError
}

/**
 * Sweep order: shallowest first so a repository-level bundle is seen before
 * its packages, then lexicographic. Total and deterministic, which is what
 * lets a resume cursor be a path rather than an index.
 */
function compareManifestPaths(left: string, right: string): number {
  return left.split('/').length - right.split('/').length ||
    left.localeCompare(right, 'en-US')
}

/** The manifests a repository publishes, in the order the sweep reads them. */
function orderedManifests(blobs: GitTreeEntry[]): GitTreeEntry[] {
  return blobs
    .filter((entry) => entry.path === 'package.json' ||
      (entry.path.endsWith('/package.json') && !entry.path.includes('/node_modules/')))
    .sort((left, right) => compareManifestPaths(left.path, right.path))
}

/**
 * Where a resumed sweep picks up: the first manifest that sorts strictly after
 * the cursor.
 *
 * A positional offset would be wrong here. The manifest list is rebuilt from a
 * fresh git tree on every pass, so a single file removed ahead of the cursor
 * shifts every later index down by one — the sweep skips a live package, and
 * the reconciliation at the end of the sweep reads that skip as "the package is
 * gone" and unpublishes it. Seeking by path is stable under both insertions and
 * deletions, including deletion of the cursor manifest itself.
 */
function resumeIndex(manifests: GitTreeEntry[], cursor: string | null): number {
  if (cursor === null || cursor.length === 0) return 0
  const index = manifests.findIndex((entry) => compareManifestPaths(entry.path, cursor) > 0)
  return index === -1 ? manifests.length : index
}

/**
 * Drops manifests that would land on a plugin row another manifest already owns.
 *
 * Two cases, both real: a repository that keeps a duplicate copy of a package
 * tree under a second directory (same `name`, so the same plugin published
 * twice), and two directories differing only in case (distinct `plugin_path`,
 * but `normalized_plugin_id` is UNIQUE, so the second insert would fail the
 * whole batch). Shallowest-then-alphabetical already decided the order, so
 * keeping the first occurrence is deterministic across passes.
 */
function withoutDuplicatePlugins(packages: InspectedPackage[]): InspectedPackage[] {
  const seenNames = new Set<string>()
  const seenPaths = new Set<string>()
  const unique: InspectedPackage[] = []
  for (const candidate of packages) {
    const name = candidate.name.toLocaleLowerCase('en-US')
    const path = pluginPathFromPackagePath(candidate.path).toLocaleLowerCase('en-US')
    if (seenNames.has(name) || seenPaths.has(path)) continue
    seenNames.add(name)
    seenPaths.add(path)
    unique.push(candidate)
  }
  return unique
}

function repositoryApiRejection(error: GitHubApiError): RepositoryRejection | null {
  if (error.status === 404 || error.status === 410) {
    return new RepositoryRejection('repository_unavailable', error.message)
  }
  if (error.status === 409) {
    return new RepositoryRejection('empty_repository', error.message)
  }
  if (error.status === 422) {
    return new RepositoryRejection('invalid_repository_tree', error.message)
  }
  return null
}

/**
 * Reads every `dsh.bundle` a repository publishes, resuming where the last
 * pass stopped.
 *
 * This used to return the *first* manifest that validated, which capped a
 * repository at one plugin forever no matter how many packages it shipped —
 * a 24-plugin monorepo surfaced as one. It now sweeps the manifest list and
 * returns all of them, bounded by a per-pass blob budget rather than by a
 * silent truncation.
 */
export async function inspectRepository(
  client: GitHubClient,
  repository: GitHubRepository,
  manifestCursor: string | null = null,
  blobBudget = MANIFEST_BLOB_BUDGET,
  waiter: (milliseconds: number) => Promise<unknown> = (milliseconds) =>
    typeof scheduler === 'undefined' ? Promise.resolve() : scheduler.wait(milliseconds),
): Promise<RepositoryInspection> {
  try {
    const normalizedName = repository.full_name.toLocaleLowerCase('en-US')
    if (DEFAULT_EXCLUSIONS.has(normalizedName)) {
      throw new RepositoryRejection('excluded_repository', 'The DeepSeek Harness core repository is not a plugin')
    }
    if (repository.fork) throw new RepositoryRejection('fork', 'Fork repositories are not collected')
    if (repository.archived) throw new RepositoryRejection('archived', 'Archived repositories are not collected')
    if (repository.disabled) throw new RepositoryRejection('disabled', 'Disabled repositories are not collected')
    if (!repository.default_branch) throw new RepositoryRejection('missing_default_branch', 'Repository has no default branch')

    const encodedRepository = repository.full_name.split('/').map(encodeURIComponent).join('/')
    const encodedBranch = encodeURIComponent(repository.default_branch)
    const tree = await requestWithRetry<GitTreeResponse>(
      client,
      `/repos/${encodedRepository}/git/trees/${encodedBranch}?recursive=1`,
      waiter,
    )
    if (tree.truncated) {
      throw new RepositoryRejection('truncated_tree', 'The repository tree is too large to validate safely')
    }
    const blobs = tree.tree.filter((entry) => entry.type === 'blob')
    const treePaths = new Set(blobs.map((entry) => entry.path))
    const manifests = orderedManifests(blobs)
    if (manifests.length === 0) {
      throw new RepositoryRejection('missing_package', 'Repository has no package.json')
    }

    // A cursor pointing past everything left — the tail was deleted between
    // passes — restarts rather than leaving the repository permanently swept.
    const start = resumeIndex(manifests, manifestCursor)
    const offset = start >= manifests.length ? 0 : start
    const window = manifests.slice(offset, offset + Math.max(1, blobBudget))
    const scanned = offset + window.length
    const nextManifestCursor = scanned < manifests.length
      ? window.at(-1)?.path ?? null
      : null

    const packages: InspectedPackage[] = []
    let lastRejection: RepositoryRejection | null = null
    for (const entry of window) {
      const blob = await requestWithRetry<GitBlobResponse>(
        client,
        `/repos/${encodedRepository}/git/blobs/${encodeURIComponent(entry.sha)}`,
        waiter,
      )
      try {
        packages.push(
          validateManifest(decodeBlob(blob, entry.path), entry.path, treePaths, repository.full_name),
        )
      } catch (error) {
        if (!(error instanceof RepositoryRejection)) throw error
        lastRejection = error
      }
    }

    // Nothing anywhere in the tree declares a bundle: that is a verdict, and
    // the reason of the last manifest to fail is the most useful one to keep.
    if (packages.length === 0 && nextManifestCursor === null && offset === 0) {
      throw lastRejection ?? new RepositoryRejection('missing_bundle', 'No package declares dsh.bundle')
    }

    return {
      githubId: repository.id,
      // An empty pass mid-sweep is not a rejection — the bundle may be in the
      // manifests this pass had no budget left to read.
      status: packages.length > 0 ? 'accepted' : nextManifestCursor === null ? 'rejected' : 'pending',
      code: packages.length > 0 ? null : lastRejection?.code ?? null,
      reason: packages.length > 0 ? null : lastRejection?.message ?? null,
      packages: withoutDuplicatePlugins(packages),
      sweepRestarted: offset === 0,
      nextManifestCursor,
    }
  } catch (error) {
    if (error instanceof RepositoryRejection) return rejection(repository, error)
    if (error instanceof GitHubApiError) {
      const apiRejection = repositoryApiRejection(error)
      if (apiRejection) return rejection(repository, apiRejection)
    }
    throw error
  }
}

export function incrementalStart(watermark: string, overlapMilliseconds = 5 * 60 * 1000): string {
  return isoSecond(new Date(new Date(watermark).getTime() - overlapMilliseconds))
}

export const discoveryInternals = {
  instantBefore,
  midpoint,
  searchQuery,
  selectMode: selectDiscoveryMode,
  strategyVersion: DISCOVERY_STRATEGY_VERSION,
}
