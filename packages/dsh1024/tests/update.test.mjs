import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CURRENT_VERSION,
  DEFAULT_RELEASE_URL,
  DEFAULT_UPDATE_FALLBACK_URL,
  DEFAULT_UPDATE_URL,
  checkForUpdate,
  compareVersions,
} from '../lib/update.js'

test('the npm registry is the preferred update source', () => {
  assert.equal(DEFAULT_UPDATE_URL, 'https://registry.npmjs.org/dsh1024/latest')
  assert.match(DEFAULT_UPDATE_FALLBACK_URL, /^https:\/\/api\.github\.com\//)
  assert.match(DEFAULT_RELEASE_URL, /\/packages\/dsh1024$/)
})

test('semantic version comparison handles releases and prereleases', () => {
  assert.equal(compareVersions('0.2.0', '0.1.9') > 0, true)
  assert.equal(compareVersions('v1.0.0', '1.0.0'), 0)
  assert.equal(compareVersions('1.0.0', '1.0.0-rc.1') > 0, true)
  assert.equal(compareVersions('1.0.0-rc.2', '1.0.0-rc.10') < 0, true)
})

test('automatic update check reads the published npm manifest first', async () => {
  const requested = []
  const fetcher = async (url) => {
    requested.push(String(url))
    return new Response(JSON.stringify({
      name: 'dsh1024',
      version: '99.0.0',
      dist: { tarball: 'https://registry.npmjs.org/dsh1024/-/dsh1024-99.0.0.tgz' },
    }), { status: 200 })
  }
  const result = await checkForUpdate(
    'https://registry.npmjs.org/dsh1024/latest',
    'https://fallback.example/package.json',
    fetcher,
  )
  assert.deepEqual(requested, ['https://registry.npmjs.org/dsh1024/latest'])
  assert.equal(result.currentVersion, CURRENT_VERSION)
  assert.equal(result.latestVersion, '99.0.0')
  assert.equal(result.updateAvailable, true)
  assert.equal(result.releaseUrl, DEFAULT_RELEASE_URL)
})

test('update check falls back to the repository API', async () => {
  let calls = 0
  const fetcher = async () => {
    calls += 1
    return calls === 1
      ? new Response('missing', { status: 404 })
      : new Response(JSON.stringify({ version: CURRENT_VERSION }), { status: 200 })
  }
  const result = await checkForUpdate(
    'https://registry.npmjs.org/dsh1024/latest',
    'https://fallback.example/package.json',
    fetcher,
  )
  assert.equal(calls, 2)
  assert.equal(result.checked, true)
  assert.equal(result.updateAvailable, false)
})

test('an unavailable update service never blocks the market', async () => {
  const fetcher = async () => new Response('unavailable', { status: 503 })
  const result = await checkForUpdate(
    'https://registry.npmjs.org/dsh1024/latest',
    'https://fallback.example/package.json',
    fetcher,
  )
  assert.equal(result.checked, false)
  assert.equal(result.updateAvailable, false)
  assert.match(result.error, /HTTP 503/)
})
