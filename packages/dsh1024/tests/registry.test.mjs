import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearRegistryCache,
  installTarget,
  loadRegistry,
  parseGitHubSource,
  validateRegistry,
} from '../lib/registry.js'

const registry = {
  name: 'dsh-1024store-catalog',
  updated: '2026-08-15T00:00:00Z',
  count: 1,
  categories: [{ id: 'tools', order: 1, label: { en: 'Tools', zh: '工具' } }],
  plugins: [{
    id: 'owner/repo',
    name: 'plugin',
    owner: 'owner',
    url: 'https://github.com/owner/repo',
    category: 'tools',
    description: { en: 'Plugin', zh: '插件' },
    install: 'dsh plugin --profile web add github:owner/repo',
    added: '2026-08-15',
    stars: 42,
  }],
}

test('compact v1 registry response is accepted as the installation allowlist', () => {
  const validated = validateRegistry(registry)
  assert.equal(validated.count, 1)
  assert.deepEqual(validated.categories[0], { id: 'tools', order: 1, label: { en: 'Tools', zh: '工具' } })
  assert.equal(validated.plugins[0]?.stars, 42)
  assert.equal(validated.plugins[0]?.id, 'owner/repo')
})

test('registry loading reuses fresh API data without reporting an outage', async () => {
  clearRegistryCache()
  let calls = 0
  const fetcher = async () => {
    calls += 1
    return new Response(JSON.stringify(registry), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  const first = await loadRegistry('https://store.example/api/v1/registry', fetcher)
  const second = await loadRegistry('https://store.example/api/v1/registry', fetcher)
  assert.equal(first.source, 'api')
  assert.equal(second.source, 'api')
  assert.equal(calls, 1)
})

test('registry loading reports cache only when an expired API refresh fails', async () => {
  clearRegistryCache()
  const originalNow = Date.now
  let now = 0
  Date.now = () => now
  try {
    const successfulFetcher = async () => new Response(JSON.stringify(registry), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
    const first = await loadRegistry('https://store.example/api/v1/registry', successfulFetcher)
    assert.equal(first.source, 'api')

    now = 6 * 60 * 1000
    const failedFetcher = async () => new Response('unavailable', { status: 503 })
    const fallback = await loadRegistry('https://store.example/api/v1/registry', failedFetcher)
    assert.equal(fallback.source, 'cache')
    assert.deepEqual(fallback.registry, first.registry)
  } finally {
    Date.now = originalNow
    clearRegistryCache()
  }
})

test('registry API failure does not fall back to a fixed bundled plugin list', async () => {
  clearRegistryCache()
  const fetcher = async () => new Response('unavailable', { status: 503 })
  await assert.rejects(
    loadRegistry('https://store.example/api/v1/registry', fetcher),
    /registry API unavailable: registry API HTTP 503/,
  )
})

test('install targets are derived from validated GitHub URLs', () => {
  assert.equal(parseGitHubSource('https://github.com/owner/repo'), 'owner/repo')
  assert.equal(parseGitHubSource('https://github.com/owner/repo/'), 'owner/repo')
  assert.equal(parseGitHubSource('https://example.com/owner/repo'), null)
  assert.equal(parseGitHubSource('https://github.com/owner/repo/tree/main/pkg'), null)
  assert.equal(installTarget(registry.plugins[0]), 'github:owner/repo')
})

test('a monorepo subpackage installs its own directory, not the repository root', () => {
  const base = registry.plugins[0]
  assert.equal(
    installTarget({ ...base, id: 'owner/repo/packages/foo' }),
    'github:owner/repo#path:packages/foo',
  )
  // Siblings stay distinct rather than both resolving to the repository.
  assert.equal(
    installTarget({ ...base, id: 'owner/repo/packages/bar' }),
    'github:owner/repo#path:packages/bar',
  )
  // The id must still agree with the validated URL, and traversal is rejected.
  assert.throws(() => installTarget({ ...base, id: 'attacker/other/packages/foo' }), /does not match/)
  assert.throws(() => installTarget({ ...base, id: 'owner/repo/../secret' }), /unsupported plugin subdirectory/)
})

test('invalid API data cannot extend the installation allowlist', () => {
  assert.throws(
    () => validateRegistry({
      ...registry,
      plugins: [{ ...registry.plugins[0], url: 'https://example.com/owner/repo' }],
    }),
    /invalid plugin/,
  )
  assert.throws(
    () => validateRegistry({
      ...registry,
      plugins: [{ ...registry.plugins[0], category: 'unlisted' }],
    }),
    /invalid plugin/,
  )
  assert.throws(() => validateRegistry({ ...registry, count: 2 }), /count does not match/)
  assert.throws(
    () => validateRegistry({ ...registry, categories: { tools: { en: 'Tools' } } }),
    /categories are invalid/,
  )
  assert.throws(() => validateRegistry({ ...registry, plugins: [] }), /plugins are empty/)
})

test('revalidation goes to the network even when the cache is still fresh', async () => {
  clearRegistryCache()
  const requested = []
  const fetcher = async (url) => {
    requested.push(String(url))
    return new Response(JSON.stringify(registry), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  try {
    await loadRegistry('https://store.example/api/v1/registry', fetcher)
    // Cache-first path: no second request.
    await loadRegistry('https://store.example/api/v1/registry', fetcher)
    assert.equal(requested.length, 1)

    const revalidated = await loadRegistry('https://store.example/api/v1/registry', fetcher, { revalidate: true })
    assert.equal(revalidated.source, 'api')
    assert.equal(requested.length, 2)
    // The refresh must not be answerable by a stale edge copy.
    assert.match(requested[1], /[?&]t=\d+/)
    assert.doesNotMatch(requested[0], /[?&]t=/)
  } finally {
    clearRegistryCache()
  }
})

test('concurrent revalidations collapse onto one request', async () => {
  clearRegistryCache()
  let calls = 0
  let release
  const gate = new Promise(resolve => { release = resolve })
  const fetcher = async () => {
    calls += 1
    await gate
    return new Response(JSON.stringify(registry), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  try {
    const all = Promise.all([
      loadRegistry('https://store.example/api/v1/registry', fetcher, { revalidate: true }),
      loadRegistry('https://store.example/api/v1/registry', fetcher, { revalidate: true }),
      loadRegistry('https://store.example/api/v1/registry', fetcher, { revalidate: true }),
    ])
    release()
    const results = await all
    assert.equal(calls, 1)
    for (const result of results) assert.equal(result.source, 'api')
  } finally {
    clearRegistryCache()
  }
})

test('a failed revalidation silently keeps the catalog already on screen', async () => {
  clearRegistryCache()
  const successfulFetcher = async () => new Response(JSON.stringify(registry), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
  try {
    const first = await loadRegistry('https://store.example/api/v1/registry', successfulFetcher)
    const failedFetcher = async () => { throw new Error('offline') }
    const fallback = await loadRegistry('https://store.example/api/v1/registry', failedFetcher, { revalidate: true })
    assert.equal(fallback.source, 'cache')
    assert.deepEqual(fallback.registry, first.registry)
  } finally {
    clearRegistryCache()
  }
})
