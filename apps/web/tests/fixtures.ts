import { BUNDLED_REGISTRY } from '../worker/lib/registry'
import type { CatalogPlugin, CatalogSnapshotResult, Registry } from '../worker/types'
import { repositoryName } from '../worker/lib/catalog'

const TEST_IDS = [
  'openma-ai/deepseek-harness-tui',
  'Jesse-njx/dsh-crosstalk',
  'MAXeaglet/dsh-bash-terminal',
  'NanmiCoder/dsh-agent-teams',
  'omdsh-dev/dsh-notification',
  'omdsh-dev/fabric',
  'omdsh-dev/dsh-gomoku',
]

function requiredPlugin(id: string) {
  const url = `https://github.com/${id}`.toLocaleLowerCase()
  const plugin = BUNDLED_REGISTRY.plugins.find((item) => item.url.toLocaleLowerCase() === url)
  if (!plugin) throw new Error(`Generated registry is missing test fixture ${id}`)
  return plugin
}

const testPlugins = TEST_IDS.map(requiredPlugin)
const testCategoryIds = new Set(testPlugins.map((plugin) => plugin.category))

export const TEST_REGISTRY: Registry = {
  updated: BUNDLED_REGISTRY.updated,
  count: testPlugins.length,
  revision: BUNDLED_REGISTRY.revision,
  categories: Object.fromEntries(
    Object.entries(BUNDLED_REGISTRY.categories).filter(([id]) => testCategoryIds.has(id)),
  ),
  plugins: testPlugins,
}

const STAR_COUNTS = [42, 120, null, 18, 7, 3, 1]
const STAR_GROWTH = [
  { growth24h: 3, growth7d: 12, growth30d: 30 },
  { growth24h: 2, growth7d: 8, growth30d: 45 },
  { growth24h: null, growth7d: null, growth30d: null },
  { growth24h: 8, growth7d: 20, growth30d: 25 },
  { growth24h: 0, growth7d: 1, growth30d: 4 },
  { growth24h: -1, growth7d: 0, growth30d: 1 },
  { growth24h: 1, growth7d: 2, growth30d: 2 },
]

const INSTALL_COUNTS = [42, 80, 0, 45, 7, 3, 1]
const INSTALLS_24H = [3, 2, 0, 8, 0, 0, 1]
const INSTALLS_7D = [12, 8, 0, 20, 1, 0, 2]
const INSTALLS_30D = [30, 45, 0, 25, 4, 1, 2]

export const TEST_PLUGINS: CatalogPlugin[] = TEST_REGISTRY.plugins.map((plugin, index) => ({
  ...plugin,
  ...STAR_GROWTH[index],
  installCount: INSTALL_COUNTS[index] ?? 0,
  installerCount: Math.floor((INSTALL_COUNTS[index] ?? 0) * 0.75),
  firstInstallCount: Math.floor((INSTALL_COUNTS[index] ?? 0) * 0.75),
  reinstallCount: (INSTALL_COUNTS[index] ?? 0) - Math.floor((INSTALL_COUNTS[index] ?? 0) * 0.75),
  updateCount: index,
  removeCount: Math.floor(index / 2),
  failureCount: index === 2 ? 1 : 0,
  installs24h: INSTALLS_24H[index] ?? 0,
  installs7d: INSTALLS_7D[index] ?? 0,
  installs30d: INSTALLS_30D[index] ?? 0,
  latestInstallAt: (INSTALL_COUNTS[index] ?? 0) > 0
    ? `2026-08-${String(14 - index).padStart(2, '0')}T13:00:00Z`
    : null,
  repository: repositoryName(plugin),
  stars: STAR_COUNTS[index] ?? null,
  forks: STAR_COUNTS[index] === null ? null : index + 1,
  pushedAt: index === 2 ? null : `2026-08-${String(14 - index).padStart(2, '0')}T12:00:00Z`,
  updatedAt: index === 2 ? null : `2026-08-${String(14 - index).padStart(2, '0')}T12:00:00Z`,
  latestReleaseAt: index === 3
    ? '2026-08-16T09:00:00Z'
    : index === 0
      ? '2026-08-15T09:00:00Z'
      : null,
}))

export function testCatalogResult(
  source: CatalogSnapshotResult['source'] = 'bundled',
): CatalogSnapshotResult {
  return {
    source,
    snapshot: {
      generatedAt: '2026-08-14T12:00:00Z',
      registryUpdated: TEST_REGISTRY.updated,
      registryRevision: TEST_REGISTRY.revision,
      metricCoverage: TEST_PLUGINS.filter((plugin) => plugin.stars !== null).length,
      categories: TEST_REGISTRY.categories,
      plugins: TEST_PLUGINS,
    },
  }
}
