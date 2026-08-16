import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  adaptLegacyRegistry,
  buildReadmeFiles,
  groupPlugins,
  loadRegistry,
  normalizeRegistry,
} from './build-readme.mjs'

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'build-readme.mjs')

const categories = [
  { id: 'tools', order: 50, label: { en: 'Tools & Capabilities', zh: '工具与能力' } },
  { id: 'ui', order: 10, label: { en: 'UI Enhancements', zh: 'UI 增强' } },
  { id: 'fun', order: 110, label: { en: 'Just for Fun', zh: '娱乐' } },
]

const registryFixture = {
  name: 'dsh-1024store-catalog',
  updated: '2026-08-15T04:05:06.000Z',
  count: 4,
  categories: categories.map(category => ({ ...category })),
  plugins: [
    {
      id: 'owner/zeta',
      name: 'Zeta-Tool',
      owner: 'owner',
      url: 'https://github.com/owner/zeta',
      category: 'tools',
      description: { en: 'Zeta tool.', zh: 'Zeta 工具。' },
      install: 'npx @deepseek-ai/dsh plugin --profile web add github:owner/zeta',
      added: '2026-08-01',
      stars: 12,
    },
    {
      id: 'owner/alpha',
      name: 'alpha-tool',
      owner: 'owner',
      url: 'https://github.com/owner/alpha',
      category: 'tools',
      description: { en: 'Alpha tool.', zh: '' },
      install: 'npx @deepseek-ai/dsh plugin --profile web add github:owner/alpha',
      added: '2026-08-02',
      stars: null,
    },
    {
      id: 'someone/scanned',
      name: 'scanned-plugin',
      owner: 'someone',
      url: 'https://github.com/someone/scanned',
      category: 'unclassified',
      description: { en: 'Discovered by the topic scan.', zh: 'Discovered by the topic scan.' },
      install: 'npx @deepseek-ai/dsh plugin --profile web add github:someone/scanned',
      added: '2026-08-10',
      stars: 3,
    },
    {
      id: 'owner/ui-thing',
      name: 'ui-thing',
      owner: 'owner',
      url: 'https://github.com/owner/ui-thing',
      category: 'ui',
      description: { en: '', zh: '界面\n增强。' },
      install: 'npx @deepseek-ai/dsh plugin --profile web add github:owner/ui-thing',
      added: '2026-08-03',
      stars: 0,
    },
  ],
}

async function fixtureRoot() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'build-readme-'))
  await mkdir(path.join(directory, 'catalog'), { recursive: true })
  await writeFile(
    path.join(directory, 'catalog/categories.json'),
    `${JSON.stringify({ version: 1, categories })}\n`,
  )
  const registryFile = path.join(directory, 'registry.json')
  await writeFile(registryFile, `${JSON.stringify(registryFixture)}\n`)
  return { directory, registryFile }
}

test('groups by category order with unclassified last and stable name sorting', () => {
  const groups = groupPlugins(normalizeRegistry(registryFixture), categories)
  assert.deepEqual(groups.map(group => group.id), ['ui', 'tools', 'unclassified'])
  assert.deepEqual(groups[1].plugins.map(plugin => plugin.name), ['alpha-tool', 'Zeta-Tool'])
  assert.deepEqual(groups.at(-1).label, { en: 'Unclassified', zh: '待分类' })
})

test('renders bilingual lists with language fallback and no volatile metrics', async () => {
  const files = await buildReadmeFiles(normalizeRegistry(registryFixture), categories)
  const zh = files['README.md']
  const en = files['catalog/README.md']

  assert.match(zh, /# DSH 1024Store/)
  assert.match(zh, /共收录 \*\*4\*\* 个插件/)
  assert.match(zh, /2026-08-15/)
  assert.match(zh, /npx dsh1024 add <owner>\/<repository>/)
  assert.doesNotMatch(zh, /@dsh-1024store\/cli/)
  assert.match(zh, /自动合并/)
  assert.match(zh, /自动同步/)
  // zh line falls back to English when the Chinese description is missing.
  assert.match(zh, /- \[alpha-tool\]\(https:\/\/github\.com\/owner\/alpha\) — Alpha tool\./)
  // multi-line descriptions collapse into a single line.
  assert.match(zh, /- \[ui-thing\]\(https:\/\/github\.com\/owner\/ui-thing\) — 界面 增强。/)
  assert.match(zh, /## 待分类/)
  assert.doesNotMatch(zh, /stars?:? \d/i)

  assert.match(en, /DSH 1024Store/)
  assert.match(en, /\*\*4\*\* plugins, updated 2026-08-15/)
  assert.match(en, /- \[Zeta-Tool\]\(https:\/\/github\.com\/owner\/zeta\) — Zeta tool\./)
  // en line falls back to Chinese when the English description is missing.
  assert.match(en, /- \[ui-thing\]\(https:\/\/github\.com\/owner\/ui-thing\) — 界面 增强。/)
  assert.match(en, /## Unclassified/)
  assert.match(en, /merged submissions are synced/i)

  // Category index order and counts.
  const zhIndex = zh.slice(zh.indexOf('## 插件分类'))
  assert.match(zhIndex, /- \[UI 增强\]\(#ui\) \(1\)\n- \[工具与能力\]\(#tools\) \(2\)\n- \[待分类\]\(#unclassified\) \(1\)/)
})

test('adapts the legacy /plugins.json shape', () => {
  const legacy = {
    updated: '2026-08-15',
    count: 1,
    revision: 'abc',
    categories: { tools: { en: 'Tools & Capabilities', zh: '工具与能力' } },
    plugins: [{
      name: 'display-name',
      owner: 'Owner',
      url: 'https://github.com/Owner/Repo-Name',
      category: 'tools',
      description: { en: 'A tool.', zh: '一个工具。' },
      install: 'npx @deepseek-ai/dsh plugin --profile web add github:Owner/Repo-Name',
      added: '2026-08-01',
    }],
  }
  const adapted = adaptLegacyRegistry(legacy)
  assert.equal(adapted.updated, '2026-08-15')
  assert.deepEqual(adapted.plugins[0].id, 'Owner/Repo-Name')
  assert.equal(adapted.plugins[0].stars, null)
})

test('falls back to the legacy endpoint when the v1 registry returns 404', async () => {
  const requested = []
  const registry = await loadRegistry({
    base: 'https://example.test/',
    async fetchImplementation(url) {
      requested.push(url)
      if (url.endsWith('/api/v1/registry')) {
        return { ok: false, status: 404, async text() { return 'not found' } }
      }
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            updated: '2026-08-15',
            count: 0,
            categories: {},
            plugins: [],
          })
        },
      }
    },
  })
  assert.deepEqual(requested, ['https://example.test/api/v1/registry', 'https://example.test/plugins.json'])
  assert.deepEqual(registry, { updated: '2026-08-15', plugins: [] })
})

test('surfaces non-404 registry failures instead of silently falling back', async () => {
  await assert.rejects(loadRegistry({
    base: 'https://example.test',
    async fetchImplementation() {
      return { ok: false, status: 500, async text() { return 'boom' } }
    },
  }), /api\/v1\/registry failed: HTTP 500/)
})

test('writes deterministic files from --from-file and verifies them with --check', async t => {
  const { directory, registryFile } = await fixtureRoot()
  t.after(() => rm(directory, { recursive: true, force: true }))

  const first = spawnSync(process.execPath, [script, '--root', directory, '--from-file', registryFile], { encoding: 'utf8' })
  assert.equal(first.status, 0, first.stderr)
  const readme = await readFile(path.join(directory, 'README.md'), 'utf8')
  const catalogReadme = await readFile(path.join(directory, 'catalog/README.md'), 'utf8')

  const second = spawnSync(process.execPath, [script, '--root', directory, '--from-file', registryFile], { encoding: 'utf8' })
  assert.equal(second.status, 0, second.stderr)
  assert.equal(await readFile(path.join(directory, 'README.md'), 'utf8'), readme)
  assert.equal(await readFile(path.join(directory, 'catalog/README.md'), 'utf8'), catalogReadme)

  const check = spawnSync(process.execPath, [script, '--root', directory, '--from-file', registryFile, '--check'], { encoding: 'utf8' })
  assert.equal(check.status, 0, check.stderr)
  assert.match(check.stdout, /up to date/)

  await writeFile(path.join(directory, 'README.md'), `${readme}\nmanual edit\n`)
  const stale = spawnSync(process.execPath, [script, '--root', directory, '--from-file', registryFile, '--check'], { encoding: 'utf8' })
  assert.equal(stale.status, 1)
  assert.match(stale.stderr, /Stale generated files: README\.md/)
})

test('refuses to regenerate the projections from a degenerate empty registry', async t => {
  const { directory } = await fixtureRoot()
  t.after(() => rm(directory, { recursive: true, force: true }))

  const emptyFile = path.join(directory, 'empty-registry.json')
  await writeFile(emptyFile, `${JSON.stringify({ ...registryFixture, count: 0, plugins: [] })}\n`)
  const result = spawnSync(process.execPath, [script, '--root', directory, '--from-file', emptyFile], { encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /0 plugins/)
  const readme = await readFile(path.join(directory, 'README.md'), 'utf8').catch(() => null)
  assert.equal(readme, null)
})
