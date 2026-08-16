export type Language = 'en' | 'zh'

export interface RegistryPlugin {
  name: string
  owner: string
  url: string
  category: string
  description: Record<Language, string>
  install: string
  added: string
}

export interface InstallMetrics {
  /** Successful install operations, including first installs and reinstalls. */
  installCount?: number
  /** Anonymous installation instances, not verified or named people. */
  installerCount?: number
  firstInstallCount?: number
  reinstallCount?: number
  updateCount?: number
  removeCount?: number
  failureCount?: number
  installs24h?: number
  installs7d?: number
  installs30d?: number
  latestInstallAt?: string | null
}

export interface CatalogPlugin extends RegistryPlugin, InstallMetrics {
  repository: string
  stars: number | null
  forks: number | null
  pushedAt: string | null
  updatedAt: string | null
  latestReleaseAt: string | null
  growth24h: number | null
  growth7d: number | null
  growth30d: number | null
}

export interface CategoryResult {
  id: string
  en: string
  zh: string
  count: number
}

export type CatalogSort =
  | 'installs'
  | 'installs24h'
  | 'installs7d'
  | 'installs30d'
  | 'stars'
  | 'growth24h'
  | 'growth7d'
  | 'growth30d'
  | 'newest'
  | 'active'
  | 'name'
export type RankingMode = Exclude<CatalogSort, 'name'>

export interface CatalogResponse {
  packages: CatalogPlugin[]
  rankings: Record<RankingMode, CatalogPlugin[]>
  categories: CategoryResult[]
  meta: {
    total: number
    catalogTotal: number
    updated: string
    generatedAt: string
    revision: string
    source: 'd1' | 'kv' | 'stale' | 'empty'
    metricCoverage: number
  }
}

export interface CategoryDescriptor {
  id: string
  order: number
  label: Record<Language, string>
}

export interface PackageDetail extends Omit<RegistryPlugin, 'category'>, InstallMetrics {
  /** Category descriptor resolved by the Worker from catalog/categories.json. */
  category: CategoryDescriptor | null
  github: {
    stars: number
    forks: number
    openIssues: number
    defaultBranch: string
    updatedAt: string
    pushedAt: string
    license: string | null
    homepage: string | null
    avatarUrl: string
  } | null
  manifest: {
    name: string | null
    version: string | null
    license: string | null
    bundlePatch: string | null
    dependencies: number
    peerDependencies: number
    engines: Record<string, string> | null
  } | null
  readme: string | null
  verification: {
    repositoryReachable: boolean
    bundleDeclared: boolean
  }
}

export interface LiveStats {
  type: 'stats'
  views: number
  online: number
  updatedAt: string
}

interface ErrorResponse {
  error?: string
}

// Absolute origin for the plugin API; empty keeps same-origin requests for the default deployment.
export const API_ORIGIN: string = (import.meta.env.VITE_API_ORIGIN ?? '').trim().replace(/\/+$/, '')

/**
 * Carries the HTTP status so callers can tell "this resource does not exist"
 * apart from "the request failed". Pages use that distinction to decide whether
 * to noindex themselves — a transport error must never deindex a real page.
 */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function requestJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ErrorResponse
    throw new ApiError(body.error || `Request failed with HTTP ${response.status}`, response.status)
  }
  return (await response.json()) as T
}

export function getPackage(owner: string, name: string, signal?: AbortSignal): Promise<PackageDetail> {
  return requestJson<PackageDetail>(
    `${API_ORIGIN}/api/v1/plugins/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
    signal,
  )
}

export function packagePath(plugin: Pick<RegistryPlugin, 'owner' | 'name' | 'url'>): string {
  return `/plugins/${encodeURIComponent(plugin.owner)}/${encodeURIComponent(repositoryName(plugin))}`
}

export function repositoryName(plugin: Pick<RegistryPlugin, 'name' | 'url'>): string {
  try {
    const segments = new URL(plugin.url).pathname.split('/').filter(Boolean)
    return (segments[1] ?? plugin.name.split('/').at(-1) ?? plugin.name).replace(/\.git$/, '')
  } catch {
    return plugin.name.split('/').at(-1) ?? plugin.name
  }
}

export function trackedInstallCommand(
  plugin: Pick<RegistryPlugin, 'owner' | 'name' | 'url'>,
): string {
  return `npx @dsh-1024store/cli add ${plugin.owner}/${repositoryName(plugin)} --profile web`
}

export function githubAvatar(owner: string): string {
  return `https://github.com/${encodeURIComponent(owner)}.png?size=96`
}

export interface AuthUser {
  githubLogin: string
  githubName: string | null
  avatarUrl: string | null
}

export interface ApiKeySummary {
  id: number
  name: string
  keyPrefix: string
  createdAt: string
  lastUsedAt: string | null
}

export interface CreatedApiKey extends ApiKeySummary {
  /** Full secret, returned exactly once at creation time. */
  key: string
}

async function requestMutation<T>(url: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body === undefined
      ? { Accept: 'application/json' }
      : { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    const parsed = (await response.json().catch(() => ({}))) as ErrorResponse
    throw new Error(parsed.error || `Request failed with HTTP ${response.status}`)
  }
  return (await response.json()) as T
}

export function githubLoginUrl(returnTo: string): string {
  return `${API_ORIGIN}/api/v1/auth/github/login?returnTo=${encodeURIComponent(returnTo)}`
}

export async function getAuthUser(signal?: AbortSignal): Promise<AuthUser | null> {
  const payload = await requestJson<{ user: AuthUser | null }>(`${API_ORIGIN}/api/v1/auth/me`, signal)
  return payload.user
}

export async function logoutUser(): Promise<void> {
  await requestMutation<{ ok: boolean }>(`${API_ORIGIN}/api/v1/auth/logout`, 'POST')
}

export async function getApiKeys(signal?: AbortSignal): Promise<ApiKeySummary[]> {
  const payload = await requestJson<{ apiKeys: ApiKeySummary[] }>(`${API_ORIGIN}/api/v1/api-keys`, signal)
  return payload.apiKeys
}

export async function createApiKey(name: string): Promise<CreatedApiKey> {
  const payload = await requestMutation<{ apiKey: CreatedApiKey }>(
    `${API_ORIGIN}/api/v1/api-keys`,
    'POST',
    name.trim().length > 0 ? { name: name.trim() } : undefined,
  )
  return payload.apiKey
}

export async function revokeApiKey(id: number): Promise<void> {
  await requestMutation<{ ok: boolean }>(`${API_ORIGIN}/api/v1/api-keys/${id}`, 'DELETE')
}
