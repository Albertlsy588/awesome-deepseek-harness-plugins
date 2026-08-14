import type {
  CatalogPlugin,
  CatalogResponse,
  CatalogSnapshotResult,
  CatalogSort,
  CategoryResult,
  RegistryPlugin,
  StoredCatalogSnapshot,
} from '../types'

export interface CatalogQuery {
  q: string
  category: string
  sort: CatalogSort
}

export function parseCatalogQuery(query: Record<string, string>): CatalogQuery {
  const requestedSort = query.sort
  const sort: CatalogSort =
    requestedSort === 'growth24h' ||
    requestedSort === 'growth7d' ||
    requestedSort === 'growth30d' ||
    requestedSort === 'newest' ||
    requestedSort === 'active' ||
    requestedSort === 'name'
      ? requestedSort
      : 'stars'
  return {
    q: (query.q ?? '').trim().slice(0, 120),
    category: (query.category ?? '').trim().slice(0, 40),
    sort,
  }
}

export function repositoryName(plugin: Pick<RegistryPlugin, 'name' | 'url'>): string {
  try {
    const segments = new URL(plugin.url).pathname.split('/').filter(Boolean)
    return (segments[1] ?? plugin.name.split('/').at(-1) ?? plugin.name).replace(/\.git$/, '')
  } catch {
    return plugin.name.split('/').at(-1) ?? plugin.name
  }
}

function categoryResults(snapshot: StoredCatalogSnapshot): CategoryResult[] {
  const counts = snapshot.plugins.reduce<Record<string, number>>((result, plugin) => {
    result[plugin.category] = (result[plugin.category] ?? 0) + 1
    return result
  }, {})

  return Object.entries(snapshot.categories)
    .map(([id, label]) => ({ id, ...label, count: counts[id] ?? 0 }))
    .filter((category) => category.count > 0)
    .sort((left, right) => right.count - left.count || left.en.localeCompare(right.en))
}

function searchableText(plugin: CatalogPlugin): string {
  return [
    plugin.name,
    plugin.owner,
    plugin.repository,
    plugin.category,
    plugin.description.en,
    plugin.description.zh,
  ]
    .join(' ')
    .toLocaleLowerCase()
}

function compareNullableNumber(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0
  if (left === null) return 1
  if (right === null) return -1
  return right - left
}

function compareNullableDate(left: string | null, right: string | null): number {
  if (!left && !right) return 0
  if (!left) return 1
  if (!right) return -1
  return right.localeCompare(left)
}

function publishedAt(plugin: CatalogPlugin): string {
  return plugin.latestReleaseAt ?? `${plugin.added}T00:00:00Z`
}

function growthForSort(plugin: CatalogPlugin, sort: CatalogSort): number | null {
  if (sort === 'growth24h') return plugin.growth24h
  if (sort === 'growth7d') return plugin.growth7d
  if (sort === 'growth30d') return plugin.growth30d
  return null
}

function hasGrowthForSort(plugin: CatalogPlugin, sort: CatalogSort): boolean {
  return sort !== 'growth24h' && sort !== 'growth7d' && sort !== 'growth30d'
    ? true
    : growthForSort(plugin, sort) !== null
}

export function comparePlugins(
  sort: CatalogSort,
): (left: CatalogPlugin, right: CatalogPlugin) => number {
  if (sort === 'name') return (left, right) => left.name.localeCompare(right.name)
  if (sort === 'growth24h' || sort === 'growth7d' || sort === 'growth30d') {
    return (left, right) =>
      compareNullableNumber(growthForSort(left, sort), growthForSort(right, sort)) ||
      compareNullableNumber(left.stars, right.stars) ||
      left.name.localeCompare(right.name)
  }
  if (sort === 'newest') {
    return (left, right) =>
      publishedAt(right).localeCompare(publishedAt(left)) || left.name.localeCompare(right.name)
  }
  if (sort === 'active') {
    return (left, right) => compareNullableDate(left.pushedAt, right.pushedAt) || left.name.localeCompare(right.name)
  }
  return (left, right) => compareNullableNumber(left.stars, right.stars) || left.name.localeCompare(right.name)
}

export function buildCatalog(result: CatalogSnapshotResult, query: CatalogQuery): CatalogResponse {
  const { snapshot, source } = result
  const normalizedSearch = query.q.toLocaleLowerCase()
  const filtered = snapshot.plugins
    .filter((plugin) => !query.category || plugin.category === query.category)
    .filter((plugin) => !normalizedSearch || searchableText(plugin).includes(normalizedSearch))
    .filter((plugin) => hasGrowthForSort(plugin, query.sort))
    .sort(comparePlugins(query.sort))

  const growthRanking = (sort: 'growth24h' | 'growth7d' | 'growth30d') =>
    [...snapshot.plugins]
      .filter((plugin) => hasGrowthForSort(plugin, sort))
      .sort(comparePlugins(sort))
      .slice(0, 100)

  return {
    packages: filtered,
    rankings: {
      stars: [...snapshot.plugins]
        .sort(comparePlugins('stars'))
        .slice(0, 100),
      growth24h: growthRanking('growth24h'),
      growth7d: growthRanking('growth7d'),
      growth30d: growthRanking('growth30d'),
      newest: [...snapshot.plugins].sort(comparePlugins('newest')).slice(0, 100),
      active: [...snapshot.plugins]
        .sort(comparePlugins('active'))
        .slice(0, 100),
    },
    categories: categoryResults(snapshot),
    meta: {
      total: filtered.length,
      catalogTotal: snapshot.plugins.length,
      updated: snapshot.registryUpdated,
      generatedAt: snapshot.generatedAt,
      revision: snapshot.registryRevision,
      source,
      metricCoverage: snapshot.metricCoverage,
    },
  }
}

export function findPlugin(
  plugins: RegistryPlugin[],
  owner: string,
  repository: string,
): RegistryPlugin | undefined {
  return plugins.find(
    (plugin) =>
      plugin.owner.toLocaleLowerCase() === owner.toLocaleLowerCase() &&
      repositoryName(plugin).toLocaleLowerCase() === repository.toLocaleLowerCase(),
  )
}
