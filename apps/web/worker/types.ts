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

export interface CategoryDescriptor {
  id: string
  order: number
  label: LocalizedText
}

export interface RepositoryMetric {
  stars: number | null
  forks: number | null
  pushedAt: string | null
  updatedAt: string | null
  latestReleaseAt: string | null
}

export interface StarGrowth {
  growth24h: number | null
  growth7d: number | null
  growth30d: number | null
}

export interface InstallMetrics {
  installCount: number
  installerCount: number
  firstInstallCount: number
  reinstallCount: number
  updateCount: number
  removeCount: number
  failureCount: number
  installs24h: number
  installs7d: number
  installs30d: number
  latestInstallAt: string | null
}

export interface CatalogPlugin extends RegistryPlugin, RepositoryMetric, StarGrowth, InstallMetrics {
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

export type CatalogSource = 'd1' | 'kv' | 'stale' | 'empty'

export interface CatalogSnapshotResult {
  snapshot: StoredCatalogSnapshot
  source: CatalogSource
}

export interface CategoryResult extends RegistryCategory {
  id: string
  count: number
}

export type CatalogSort =
  | 'stars'
  | 'installs'
  | 'installs24h'
  | 'installs7d'
  | 'installs30d'
  | 'growth24h'
  | 'growth7d'
  | 'growth30d'
  | 'newest'
  | 'active'
  | 'name'

export interface CatalogResponse {
  packages: CatalogPlugin[]
  rankings: {
    stars: CatalogPlugin[]
    installs: CatalogPlugin[]
    installs24h: CatalogPlugin[]
    installs7d: CatalogPlugin[]
    installs30d: CatalogPlugin[]
    growth24h: CatalogPlugin[]
    growth7d: CatalogPlugin[]
    growth30d: CatalogPlugin[]
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

export interface RegistryProjectionPlugin {
  id: string
  name: string
  owner: string
  url: string
  category: string
  description: LocalizedText
  install: string
  added: string
  stars: number | null
}

export interface RegistryProjection {
  name: string
  updated: string
  count: number
  categories: CategoryDescriptor[]
  plugins: RegistryProjectionPlugin[]
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

export interface PackageDetail extends RegistryPlugin, InstallMetrics {
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
