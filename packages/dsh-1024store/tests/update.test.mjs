import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CURRENT_VERSION,
  checkForUpdate,
  compareVersions,
} from '../lib/update.js'

test('semantic version comparison handles releases and prereleases', () => {
  assert.equal(compareVersions('0.2.0', '0.1.9') > 0, true)
  assert.equal(compareVersions('v1.0.0', '1.0.0'), 0)
  assert.equal(compareVersions('1.0.0', '1.0.0-rc.1') > 0, true)
  assert.equal(compareVersions('1.0.0-rc.2', '1.0.0-rc.10') < 0, true)
})

test('automatic update check reports a newer first-party version', async () => {
  const fetcher = async () => new Response(JSON.stringify({
    version: '0.2.0',
    releaseUrl: 'https://store.example/releases/0.2.0',
  }), { status: 200 })
  const result = await checkForUpdate(
    'https://store.example/api/dsh-1024store',
    'https://fallback.example/package.json',
    fetcher,
  )
  assert.equal(result.currentVersion, CURRENT_VERSION)
  assert.equal(result.latestVersion, '0.2.0')
  assert.equal(result.updateAvailable, true)
  assert.equal(result.releaseUrl, 'https://store.example/releases/0.2.0')
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
    'https://store.example/api/dsh-1024store',
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
    'https://store.example/api/dsh-1024store',
    'https://fallback.example/package.json',
    fetcher,
  )
  assert.equal(result.checked, false)
  assert.equal(result.updateAvailable, false)
  assert.match(result.error, /HTTP 503/)
})
