import assert from 'node:assert/strict'
import test from 'node:test'
import { installedPluginIds, isTrustedSameOrigin, mountMarketRoutes } from '../lib/routes.js'

const baseConfig = {
  profile: 'market-test',
  registryUrl: 'https://deepseek1024.com/api/v1/registry',
  updateUrl: 'https://deepseek1024.com/api/v1/self/update',
}

function routeHarness(embedUrl) {
  const routes = new Map()
  const dispose = mountMarketRoutes({
    register(route) {
      routes.set(route.path, route)
      return () => routes.delete(route.path)
    },
  }, { ...baseConfig, embedUrl })
  return { routes, dispose }
}

test('the shell exposes its validated embed URL without credentials', async () => {
  const { routes, dispose } = routeHarness('https://deepseek1024.com/embed/store?bridge=dsh1024-v1')
  let status = 0
  let body = ''
  await routes.get('/dsh1024/embed-config').handler(
    { method: 'GET' },
    {
      writeHead(value) { status = value },
      end(value = '') { body = String(value) },
    },
  )
  assert.equal(status, 200)
  assert.deepEqual(JSON.parse(body), {
    url: 'https://deepseek1024.com/embed/store?bridge=dsh1024-v1',
    origin: 'https://deepseek1024.com',
  })
  dispose()
  assert.equal(routes.size, 0)
})

test('loopback HTTP is accepted for local preview but remote HTTP is rejected', () => {
  const { dispose } = routeHarness('http://127.0.0.1:14568/embed/store?bridge=dsh1024-v1')
  dispose()
  assert.throws(
    () => routeHarness('http://store.example/embed/store'),
    /embed URL must use HTTPS/,
  )
  assert.throws(
    () => routeHarness('https://user:secret@store.example/embed/store'),
    /cannot contain credentials/,
  )
})

test('same-origin mutations work on private LAN addresses without trusting public hostnames', () => {
  assert.equal(isTrustedSameOrigin('http://127.0.0.1:14567', '127.0.0.1:14567'), true)
  assert.equal(isTrustedSameOrigin('http://192.168.1.42:14567', '192.168.1.42:14567'), true)
  assert.equal(isTrustedSameOrigin('http://172.20.0.3:14567', '172.20.0.3:14567'), true)
  assert.equal(isTrustedSameOrigin('http://harness.local:14567', 'harness.local:14567'), true)
  assert.equal(isTrustedSameOrigin('http://public.example:14567', 'public.example:14567'), false)
  assert.equal(isTrustedSameOrigin('http://192.168.1.42:14567', '127.0.0.1:14567'), false)
  assert.equal(isTrustedSameOrigin('https://evil.example', '192.168.1.42:14567'), false)
})

test('installed dependencies map to catalog ids without exposing their specs', () => {
  const plugins = [
    {
      id: 'owner/mono', name: 'mono-root', owner: 'owner',
      url: 'https://github.com/owner/mono', category: 'tools', description: { en: 'root' },
      install: 'dsh plugin add github:owner/mono', added: '2026-01-01',
    },
    {
      id: 'owner/mono/packages/child', name: 'child', owner: 'owner',
      url: 'https://github.com/owner/mono', category: 'tools', description: { en: 'child' },
      install: 'dsh plugin add github:owner/mono#path:packages/child', added: '2026-01-01',
    },
    {
      id: 'owner/npm-plugin', name: 'npm-plugin', owner: 'owner',
      url: 'https://github.com/owner/npm-plugin', category: 'tools', description: { en: 'npm' },
      install: 'dsh plugin add published-plugin', target: 'published-plugin', added: '2026-01-01',
    },
  ]
  const installed = {
    child: 'github:owner/mono#path:packages/child&commit=abc123',
    'published-plugin': '^1.2.3',
  }

  assert.deepEqual(installedPluginIds(installed, plugins), [
    'owner/mono/packages/child',
    'owner/npm-plugin',
  ])
})
