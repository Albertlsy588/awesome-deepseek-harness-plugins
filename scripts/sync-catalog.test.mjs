import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { categoryIdSet, loadCatalogEntries, readCategories } from './lib/catalog-entry.mjs'
import {
  buildSyncBody,
  defaultSyncUrl,
  postCatalogSync,
  resolveSyncConfig,
} from './sync-catalog.mjs'

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sync-catalog.mjs')

const categories = {
  version: 1,
  categories: [
    { id: 'tools', order: 10, label: { en: 'Tools', zh: '工具' } },
    { id: 'fun', order: 20, label: { en: 'Just for Fun', zh: '娱乐' } },
  ],
}

function entry(id, category = 'tools') {
  const name = id.split('/')[1]
  return {
    $schema: '../schema/plugin.schema.json',
    id,
    name,
    repository: `https://github.com/${id}`,
    category,
    description: { en: `The ${name} plugin.`, zh: `${name} 插件。` },
    added: '2026-08-14',
  }
}

function fileName(id) {
  return `${id.toLocaleLowerCase('en-US').replace(/[^a-z0-9/]+/g, '-').replace('/', '--')}.json`
}

async function fixture(entries) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sync-catalog-'))
  await mkdir(path.join(directory, 'catalog/plugins'), { recursive: true })
  await writeFile(path.join(directory, 'catalog/categories.json'), `${JSON.stringify(categories)}\n`)
  for (const [file, value] of entries) {
    await writeFile(path.join(directory, 'catalog/plugins', file), `${JSON.stringify(value, null, 2)}\n`)
  }
  return directory
}

test('loads and validates every catalog entry in stable file order', async t => {
  const directory = await fixture([
    [fileName('zed/plugin-b'), entry('zed/plugin-b', 'fun')],
    [fileName('abe/plugin-a'), entry('abe/plugin-a')],
  ])
  t.after(() => rm(directory, { recursive: true, force: true }))

  const loaded = await loadCatalogEntries(directory, categoryIdSet(await readCategories(directory)))
  assert.deepEqual(loaded.map(value => value.id), ['abe/plugin-a', 'zed/plugin-b'])
})

test('rejects an invalid catalog entry with its file name', async t => {
  const invalid = { ...entry('owner/broken'), category: 'unknown' }
  const directory = await fixture([[fileName('owner/broken'), invalid]])
  t.after(() => rm(directory, { recursive: true, force: true }))

  await assert.rejects(
    async () => loadCatalogEntries(directory, categoryIdSet(await readCategories(directory))),
    /catalog\/plugins\/owner--broken\.json has an unknown category/,
  )
})

test('builds the sync body without $schema and with a github_ci source', () => {
  const body = buildSyncBody([entry('owner/plugin')])
  assert.deepEqual(body, {
    source: 'github_ci',
    entries: [{
      id: 'owner/plugin',
      name: 'plugin',
      repository: 'https://github.com/owner/plugin',
      category: 'tools',
      description: { en: 'The plugin plugin.', zh: 'plugin 插件。' },
      added: '2026-08-14',
    }],
  })
  assert.equal('$schema' in body.entries[0], false)
  assert.equal('categories' in body, false)
})

test('carries the ordered category list through the sync body', async t => {
  const directory = await fixture([[fileName('owner/plugin'), entry('owner/plugin')]])
  t.after(() => rm(directory, { recursive: true, force: true }))

  const body = buildSyncBody([entry('owner/plugin')], await readCategories(directory))
  assert.deepEqual(body.categories, [
    { id: 'tools', order: 10, label: { en: 'Tools', zh: '工具' } },
    { id: 'fun', order: 20, label: { en: 'Just for Fun', zh: '娱乐' } },
  ])
  assert.equal(body.source, 'github_ci')
  assert.deepEqual(body.entries.map(value => value.id), ['owner/plugin'])
})

test('rejects a category that is missing its order or labels', () => {
  assert.throws(() => buildSyncBody([], [{ order: 10, label: { en: 'Tools', zh: '工具' } }]), /missing its id/)
  assert.throws(() => buildSyncBody([], [{ id: 'tools', label: { en: 'Tools', zh: '工具' } }]), /category tools is missing an integer order/)
  assert.throws(() => buildSyncBody([], [{ id: 'tools', order: 10, label: { en: 'Tools' } }]), /category tools is missing its zh label/)
})

test('posts the body with a bearer token and parses the acknowledgement', async () => {
  const calls = []
  const body = buildSyncBody([entry('owner/plugin')], categories.categories)
  const result = await postCatalogSync({
    url: 'https://example.test/api/v1/catalog/sync',
    token: 'secret-token',
    body,
    async fetchImplementation(url, options) {
      calls.push({ url, options })
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ ok: true, total: 264, categories: 2, removedSources: 2 })
        },
      }
    },
  })
  assert.deepEqual(result, { ok: true, total: 264, categories: 2, removedSources: 2 })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://example.test/api/v1/catalog/sync')
  assert.equal(calls[0].options.method, 'POST')
  assert.equal(calls[0].options.headers.Authorization, 'Bearer secret-token')
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json')
  const sent = JSON.parse(calls[0].options.body)
  assert.equal(sent.source, 'github_ci')
  assert.deepEqual(sent.entries.map(value => value.id), ['owner/plugin'])
  assert.deepEqual(sent.categories, categories.categories)
})

test('fails loudly on an unauthorized response', async () => {
  await assert.rejects(postCatalogSync({
    url: defaultSyncUrl,
    token: 'wrong',
    body: { source: 'github_ci', entries: [] },
    async fetchImplementation() {
      return { ok: false, status: 401, async text() { return 'Unauthorized' } }
    },
  }), /HTTP 401 .*Unauthorized/)
})

test('rejects an unacknowledged sync response', async () => {
  await assert.rejects(postCatalogSync({
    url: defaultSyncUrl,
    token: 'token',
    body: { source: 'github_ci', entries: [] },
    async fetchImplementation() {
      return { ok: true, status: 200, async text() { return JSON.stringify({ ok: false }) } }
    },
  }), /not acknowledged/)
})

test('requires the sync token unless dry-running', () => {
  assert.throws(() => resolveSyncConfig({}), /CATALOG_SYNC_TOKEN is not set/)
  assert.throws(() => resolveSyncConfig({ CATALOG_SYNC_TOKEN: '   ' }), /CATALOG_SYNC_TOKEN is not set/)
  assert.deepEqual(resolveSyncConfig({ CATALOG_SYNC_TOKEN: 'token' }), { url: defaultSyncUrl, token: 'token' })
  assert.deepEqual(
    resolveSyncConfig({ CATALOG_SYNC_TOKEN: 'token', CATALOG_SYNC_URL: 'https://example.test/sync' }),
    { url: 'https://example.test/sync', token: 'token' },
  )
  assert.equal(resolveSyncConfig({}, { dryRun: true }).url, defaultSyncUrl)
})

test('dry-run prints the request body without needing a token or network', async t => {
  const directory = await fixture([[fileName('owner/plugin'), entry('owner/plugin')]])
  t.after(() => rm(directory, { recursive: true, force: true }))

  const result = spawnSync(process.execPath, [script, '--root', directory, '--dry-run'], {
    encoding: 'utf8',
    env: { ...process.env, CATALOG_SYNC_TOKEN: '', CATALOG_SYNC_URL: 'https://127.0.0.1:1/unreachable' },
  })
  assert.equal(result.status, 0, result.stderr)
  const body = JSON.parse(result.stdout)
  assert.equal(body.source, 'github_ci')
  assert.deepEqual(body.entries.map(value => value.id), ['owner/plugin'])
  assert.deepEqual(body.categories, categories.categories)
  assert.match(result.stderr, /Dry run: validated 1 entries and 2 categories/)
})

test('fails without a token when not dry-running', async t => {
  const directory = await fixture([[fileName('owner/plugin'), entry('owner/plugin')]])
  t.after(() => rm(directory, { recursive: true, force: true }))

  const result = spawnSync(process.execPath, [script, '--root', directory], {
    encoding: 'utf8',
    env: { ...process.env, CATALOG_SYNC_TOKEN: '' },
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /CATALOG_SYNC_TOKEN is not set/)
})
