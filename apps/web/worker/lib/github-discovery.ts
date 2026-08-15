const GITHUB_API = 'https://api.github.com'
const SEARCH_RESULT_LIMIT = 1000
const FIRST_GITHUB_INSTANT = '2008-01-01T00:00:00Z'
const MAX_PACKAGE_MANIFESTS = 25
const DEFAULT_EXCLUSIONS = new Set(['deepseek-ai/deepseek-harness'])

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

export interface RepositoryInspection {
  githubId: number
  status: 'accepted' | 'rejected'
  code: string | null
  reason: string | null
  package: {
    name: string
    version: string | null
    path: string
    patch: string
  } | null
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

function searchQuery(topic: string, qualifier: 'created' | 'updated', start: string, end: string): string {
  return [`topic:${topic}`, 'fork:false', 'archived:false', `${qualifier}:${start}..${end}`].join(' ')
}

async function searchPage(
  client: GitHubClient,
  topic: string,
  qualifier: 'created' | 'updated',
  start: string,
  end: string,
  page: number,
): Promise<SearchResponse> {
  const parameters = new URLSearchParams({
    q: searchQuery(topic, qualifier, start, end),
    sort: qualifier,
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
  qualifier: 'created' | 'updated',
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
  const qualifier = mode === 'full' ? 'created' : 'updated'
  const rangeStart = mode === 'full' ? FIRST_GITHUB_INSTANT : start
  if (rangeStart === null) throw new Error('Incremental discovery requires a watermark')
  return uniqueRepositories(await collectRange(client, topic, qualifier, rangeStart, end))
}

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

function validateManifest(source: string, manifestPath: string, treePaths: Set<string>) {
  let manifest: unknown
  try {
    manifest = JSON.parse(source)
  } catch {
    throw new RepositoryRejection('invalid_package', `${manifestPath} is invalid JSON`)
  }
  if (!isObject(manifest) || typeof manifest.name !== 'string' || manifest.name.trim() === '') {
    throw new RepositoryRejection('invalid_package', `${manifestPath} does not declare a package name`)
  }
  const dsh = isObject(manifest.dsh) ? manifest.dsh : null
  const bundle = dsh && isObject(dsh.bundle) ? dsh.bundle : null
  if (!bundle) throw new RepositoryRejection('missing_bundle', `${manifestPath} does not declare dsh.bundle`)
  const patch = resolvePatchPath(manifestPath, bundle.patch)
  if (!treePaths.has(patch)) {
    throw new RepositoryRejection('missing_bundle_patch', `${patch} does not exist on the default branch`)
  }
  return {
    name: manifest.name.trim(),
    version: typeof manifest.version === 'string' && manifest.version.trim() !== ''
      ? manifest.version.trim()
      : null,
    path: manifestPath,
    patch,
  }
}

function rejection(repository: GitHubRepository, error: RepositoryRejection): RepositoryInspection {
  return {
    githubId: repository.id,
    status: 'rejected',
    code: error.code,
    reason: error.message,
    package: null,
  }
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

export async function inspectRepository(
  client: GitHubClient,
  repository: GitHubRepository,
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
    const tree = await client.request<GitTreeResponse>(
      `/repos/${encodedRepository}/git/trees/${encodedBranch}?recursive=1`,
    )
    if (tree.truncated) {
      throw new RepositoryRejection('truncated_tree', 'The repository tree is too large to validate safely')
    }
    const blobs = tree.tree.filter((entry) => entry.type === 'blob')
    const treePaths = new Set(blobs.map((entry) => entry.path))
    const manifests = blobs
      .filter((entry) => entry.path === 'package.json' ||
        (entry.path.endsWith('/package.json') && !entry.path.includes('/node_modules/')))
      .sort((left, right) => left.path.split('/').length - right.path.split('/').length ||
        left.path.localeCompare(right.path, 'en-US'))
      .slice(0, MAX_PACKAGE_MANIFESTS)
    if (manifests.length === 0) {
      throw new RepositoryRejection('missing_package', 'Repository has no package.json')
    }

    let lastRejection: RepositoryRejection | null = null
    for (const entry of manifests) {
      const blob = await client.request<GitBlobResponse>(
        `/repos/${encodedRepository}/git/blobs/${encodeURIComponent(entry.sha)}`,
      )
      try {
        const packageInfo = validateManifest(decodeBlob(blob, entry.path), entry.path, treePaths)
        return {
          githubId: repository.id,
          status: 'accepted',
          code: null,
          reason: null,
          package: packageInfo,
        }
      } catch (error) {
        if (!(error instanceof RepositoryRejection)) throw error
        lastRejection = error
      }
    }
    throw lastRejection ?? new RepositoryRejection('missing_bundle', 'No package declares dsh.bundle')
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
}
