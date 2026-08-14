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

export const TEST_PLUGINS: CatalogPlugin[] = TEST_REGISTRY.plugins.map((plugin, index) => ({
  ...plugin,
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
