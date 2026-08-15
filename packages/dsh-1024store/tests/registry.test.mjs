import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearRegistryCache,
  installTarget,
  loadRegistry,
  parseGitHubSource,
  validateCatalogResponse,
} from '../lib/registry.js'

const catalog = {
  categories: [{ id: 'tools', en: 'Tools', zh: '工具', count: 1 }],
  packages: [{
    name: 'plugin',
    owner: 'owner',
    repository: 'repo',
    url: 'https://github.com/owner/repo',
    category: 'tools',
    description: { en: 'Plugin', zh: '插件' },
    install: 'dsh plugin add github:owner/repo',
    added: '2026-08-15',
    stars: 42,
  }],
  rankings: {},
  meta: {
    total: 1,
    catalogTotal: 1,
    updated: '2026-08-15',
    generatedAt: '2026-08-15T00:00:00Z',
    revision: 'sha256:test',
    source: 'kv',
    metricCoverage: 1,
  },
}

test('dynamic catalog API response is normalized as the installation allowlist', () => {
  const registry = validateCatalogResponse(catalog)
  assert.equal(registry.count, 1)
  assert.deepEqual(registry.categories.tools, { en: 'Tools', zh: '工具' })
  assert.equal(registry.plugins[0]?.stars, 42)
})

test('catalog loading reuses fresh API data without reporting an outage', async () => {
  clearRegistryCache()
  let calls = 0
  const fetcher = async () => {
    calls += 1
    return new Response(JSON.stringify(catalog), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  const first = await loadRegistry('https://store.example/api/plugin', fetcher)
  const second = await loadRegistry('https://store.example/api/plugin', fetcher)
  assert.equal(first.source, 'api')
  assert.equal(second.source, 'api')
  assert.equal(calls, 1)
})

test('catalog loading reports cache only when an expired API refresh fails', async () => {
  clearRegistryCache()
  const originalNow = Date.now
  let now = 0
  Date.now = () => now
  try {
    const successfulFetcher = async () => new Response(JSON.stringify(catalog), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
    const first = await loadRegistry('https://store.example/api/plugin', successfulFetcher)
    assert.equal(first.source, 'api')

    now = 6 * 60 * 1000
    const failedFetcher = async () => new Response('unavailable', { status: 503 })
    const fallback = await loadRegistry('https://store.example/api/plugin', failedFetcher)
    assert.equal(fallback.source, 'cache')
    assert.deepEqual(fallback.registry, first.registry)
  } finally {
    Date.now = originalNow
    clearRegistryCache()
  }
})

test('catalog API failure does not fall back to a fixed bundled plugin list', async () => {
  clearRegistryCache()
  const fetcher = async () => new Response('unavailable', { status: 503 })
  await assert.rejects(
    loadRegistry('https://store.example/api/plugin', fetcher),
    /catalog API unavailable: catalog API HTTP 503/,
  )
})

test('install targets are derived from validated GitHub URLs', () => {
  assert.equal(parseGitHubSource('https://github.com/owner/repo'), 'owner/repo')
  assert.equal(parseGitHubSource('https://github.com/owner/repo/'), 'owner/repo')
  assert.equal(parseGitHubSource('https://example.com/owner/repo'), null)
  assert.equal(parseGitHubSource('https://github.com/owner/repo/tree/main/pkg'), null)
  assert.equal(installTarget(catalog.packages[0]), 'github:owner/repo')
})

test('invalid API data cannot extend the installation allowlist', () => {
  const invalid = {
    ...catalog,
    packages: [{ ...catalog.packages[0], url: 'https://example.com/owner/repo' }],
  }
  assert.throws(() => validateCatalogResponse(invalid), /invalid plugin/)
  assert.throws(
    () => validateCatalogResponse({ ...catalog, meta: { ...catalog.meta, catalogTotal: 2 } }),
    /count does not match/,
  )
})
