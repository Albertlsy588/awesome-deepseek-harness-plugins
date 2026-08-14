export type Language = 'en' | 'zh'

export interface LocalizedText {
  en: string
  zh: string
}

export interface RegistryCategory {
  en: string
  zh: string
}

export interface RegistryPlugin {
  name: string
  owner: string
  url: string
  category: string
  description: LocalizedText
  install: string
  added: string
}

export interface Registry {
  updated: string
  count: number
  revision: string
  categories: Record<string, RegistryCategory>
  plugins: RegistryPlugin[]
}

export type RegistrySource = 'bundled'

export interface RegistryResult {
  registry: Registry
  source: RegistrySource
}

export interface RepositoryMetric {
  stars: number | null
  forks: number | null
  pushedAt: string | null
  updatedAt: string | null
  latestReleaseAt: string | null
}

export interface CatalogPlugin extends RegistryPlugin, RepositoryMetric {
  repository: string
}

export interface StoredCatalogSnapshot {
  generatedAt: string
  registryUpdated: string
  registryRevision: string
  metricCoverage: number
  categories: Record<string, RegistryCategory>
  plugins: CatalogPlugin[]
}

export type CatalogSource = 'bundled' | 'kv' | 'stale'

export interface CatalogSnapshotResult {
  snapshot: StoredCatalogSnapshot
  source: CatalogSource
}

export interface CategoryResult extends RegistryCategory {
  id: string
  count: number
}

export type CatalogSort = 'stars' | 'newest' | 'active' | 'name'

export interface CatalogResponse {
  packages: CatalogPlugin[]
  rankings: {
    stars: CatalogPlugin[]
    newest: CatalogPlugin[]
    active: CatalogPlugin[]
  }
  categories: CategoryResult[]
  meta: {
    total: number
    catalogTotal: number
    updated: string
    generatedAt: string
    revision: string
    source: CatalogSource
    metricCoverage: number
  }
}

export interface PackageManifestSummary {
  name: string | null
  version: string | null
  license: string | null
  bundlePatch: string | null
  dependencies: number
  peerDependencies: number
  engines: Record<string, string> | null
}

export interface GitHubSummary {
  stars: number
  forks: number
  openIssues: number
  defaultBranch: string
  updatedAt: string
  pushedAt: string
  license: string | null
  homepage: string | null
  avatarUrl: string
}

export interface PackageDetail extends RegistryPlugin {
  github: GitHubSummary | null
  manifest: PackageManifestSummary | null
  readme: string | null
  verification: {
    repositoryReachable: boolean
    bundleDeclared: boolean
  }
}

export interface LiveStatsPayload {
  type: 'stats'
  views: number
  online: number
  updatedAt: string
}

export interface BackgroundContext {
  waitUntil(promise: Promise<unknown>): void
}
