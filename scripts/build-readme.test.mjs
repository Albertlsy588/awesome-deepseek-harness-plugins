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
  catalogRevision,
  groupPlugins,
  loadRegistry,
  normalizeRegistry,
  screenshotBranch,
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
      install: 'dsh plugin --profile web add github:owner/zeta',
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
      install: 'dsh plugin --profile web add github:owner/alpha',
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
      install: 'dsh plugin --profile web add github:someone/scanned',
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
      install: 'dsh plugin --profile web add github:owner/ui-thing',
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
  assert.match(zh, /dsh1024 add <owner>\/<repository>/)
  assert.doesNotMatch(zh, /@dsh-1024store\/cli/)
  assert.match(zh, /自动合并/)
  assert.match(zh, /自动同步/)
  // zh line falls back to English when the Chinese description is missing.
  assert.match(zh, /- \[alpha-tool\]\(https:\/\/github\.com\/owner\/alpha\) — Alpha tool\./)
  // multi-line descriptions collapse into a single line.
  assert.match(zh, /- \[ui-thing\]\(https:\/\/github\.com\/owner\/ui-thing\) — 界面 增强。/)
  assert.match(zh, /<summary><strong>待分类<\/strong> · 1 个插件<\/summary>/)
  assert.doesNotMatch(zh, /stars?:? \d/i)

  assert.match(en, /DSH 1024Store/)
  assert.match(en, /\*\*4\*\* plugins, updated 2026-08-15/)
  assert.match(en, /- \[Zeta-Tool\]\(https:\/\/github\.com\/owner\/zeta\) — Zeta tool\./)
  // en line falls back to Chinese when the English description is missing.
  assert.match(en, /- \[ui-thing\]\(https:\/\/github\.com\/owner\/ui-thing\) — 界面 增强。/)
  assert.match(en, /<summary><strong>Unclassified<\/strong> · 1 plugins<\/summary>/)
  assert.match(en, /merged submissions are synced/i)

  // Category index order and counts.
  const zhIndex = zh.slice(zh.indexOf('## 插件分类'))
  assert.match(zhIndex, /- \[UI 增强\]\(#ui\) \(1\)\n- \[工具与能力\]\(#tools\) \(2\)\n- \[待分类\]\(#unclassified\) \(1\)/)
})

test('collapses every category into a default-closed details block', async () => {
  const files = await buildReadmeFiles(normalizeRegistry(registryFixture), categories)

  for (const [name, content] of Object.entries(files)) {
    // Default-collapsed: an `open` attribute would defeat the whole point.
    assert.doesNotMatch(content, /<details[^>]/, `${name} must not open any group by default`)
    assert.equal((content.match(/<details>/g) ?? []).length, 3, `${name} must wrap all three groups`)
    assert.equal((content.match(/<\/details>/g) ?? []).length, 3, `${name} must close all three groups`)
    // GitHub only renders Markdown inside <details> when the summary is followed by a
    // blank line and the block is not indented.
    assert.doesNotMatch(content, /^[ \t]+<(details|summary|\/details)/m, `${name} must not indent the HTML`)
    assert.match(content, /<\/summary>\n\n- \[/, `${name} needs a blank line before the list`)
    assert.match(content, /\n\n<\/details>/, `${name} needs a blank line before the closing tag`)
    // The anchor stays outside so the category index can still jump to a closed group.
    assert.match(content, /<a id="ui"><\/a>\n\n<details>/, `${name} must keep anchors outside the block`)
  }

  // Category labels contain "&", which must be escaped inside the raw HTML summary.
  assert.match(files['catalog/README.md'], /<summary><strong>Tools &amp; Capabilities<\/strong> · 2 plugins<\/summary>/)
  for (const summary of files['catalog/README.md'].match(/<summary>.*<\/summary>/g) ?? []) {
    assert.doesNotMatch(summary, /&(?!amp;|lt;|gt;)/, `unescaped & in ${summary}`)
  }
  assert.match(files['README.md'], /<summary><strong>工具与能力<\/strong> · 2 个插件<\/summary>/)
})

test('leads with the marketplace, in-app plugin, scheduled validation, API and contribution calls', async () => {
  const files = await buildReadmeFiles(normalizeRegistry(registryFixture), categories)
  const zh = files['README.md']
  const en = files['catalog/README.md']

  // The four things this repository ships beyond the list itself.
  assert.match(zh, /deepseek1024\.com/)
  assert.match(zh, /CLOUDFLARE_API_TOKEN/)
  assert.match(zh, /dsh plugin --profile web add dsh-1024store/)
  assert.match(zh, /定时收集/)
  assert.match(zh, /格式校验/)
  assert.match(zh, /绝不执行仓库代码/)
  assert.match(zh, /api\.deepseek1024\.com\/v1\/plugins\/search/)

  // Star / issue / PR / fork calls to action.
  assert.match(zh, /\/stargazers\)/)
  assert.match(zh, /\/issues\/new\)/)
  assert.match(zh, /\/pulls\)/)
  assert.match(zh, /\/fork\)/)

  assert.match(en, /CLOUDFLARE_API_TOKEN/)
  assert.match(en, /dsh plugin --profile web add dsh-1024store/)
  assert.match(en, /never installing dependencies or executing repository code/)
  assert.match(en, /api\.deepseek1024\.com\/v1\/plugins\/search/)
  for (const suffix of ['/stargazers)', '/issues/new)', '/pulls)', '/fork)']) {
    assert.ok(en.includes(suffix), `English README is missing the ${suffix} call to action`)
  }
  // The review gate has three verdicts; the README must not promise that every
  // passing pull request merges itself. Kept in sync with CONTRIBUTING.md,
  // the PR template, SKILL.md and submission-reference.md.
  assert.match(zh, /维护者人工审核/)
  assert.match(en, /waits for maintainer approval/)

  // Links in catalog/README.md resolve one directory up.
  assert.match(en, /\]\(\.\.\/CONTRIBUTING\.md\)/)
  assert.match(en, /\]\(\.\.\/docs\/api\.md\)/)
})

test('caps only the unclassified bucket and keeps the projection renderable', async () => {
  // 3 unclassified entries with a limit of 500 stay uncapped; build a bucket big
  // enough to trip the cap without depending on the production catalog.
  const many = Array.from({ length: 620 }, (_, index) => ({
    id: `scanner/plugin-${String(index).padStart(4, '0')}`,
    name: `scanned-${String(index).padStart(4, '0')}`,
    owner: 'scanner',
    url: `https://github.com/scanner/plugin-${String(index).padStart(4, '0')}`,
    category: 'unclassified',
    description: { en: 'Discovered by the topic scan.', zh: '由 topic 扫描发现。' },
    added: '2026-08-15',
    stars: null,
  }))
  const big = { ...registryFixture, plugins: [...registryFixture.plugins, ...many] }
  const files = await buildReadmeFiles(normalizeRegistry(big), categories)
  const zh = files['README.md']
  const en = files['catalog/README.md']

  // Curated categories keep every entry.
  assert.match(zh, /<summary><strong>工具与能力<\/strong> · 2 个插件<\/summary>/)
  assert.match(en, /<summary><strong>Tools &amp; Capabilities<\/strong> · 2 plugins<\/summary>/)

  // The unclassified bucket is capped, and says so instead of pretending to be whole.
  assert.match(zh, /<summary><strong>待分类<\/strong> · 显示 500 \/ 共 621 个<\/summary>/)
  assert.match(en, /<summary><strong>Unclassified<\/strong> · showing 500 of 621<\/summary>/)
  assert.match(zh, /其余 121 个待分类插件未在此列出/)
  assert.match(en, /The remaining 121 unclassified plugins are not listed here/)

  // The category index still reports the true total, not the truncated one.
  assert.match(zh, /- \[待分类\]\(#unclassified\) \(621\)/)

  const listed = (zh.match(/^- \[scanned-\d{4}\]/gm) ?? []).length
  assert.equal(listed, 500, 'exactly the cap should be listed')
})

test('refuses to emit a projection GitHub would silently truncate', async () => {
  // One entry whose description alone blows the 500 KiB budget: the guard must throw
  // rather than ship a file whose tail is invisible on GitHub.
  const huge = {
    ...registryFixture,
    plugins: [{
      ...registryFixture.plugins[0],
      description: { en: 'x'.repeat(600 * 1024), zh: 'x'.repeat(600 * 1024) },
    }],
  }
  await assert.rejects(
    buildReadmeFiles(normalizeRegistry(huge), categories),
    /GitHub renders at most \d+ and silently drops everything past that offset/,
  )
})

test('leads both projections with the homepage screenshot from the assets branch', async () => {
  const files = await buildReadmeFiles(normalizeRegistry(registryFixture), categories)
  const revision = catalogRevision(normalizeRegistry(registryFixture))
  const source = `https://raw.githubusercontent.com/imsai-sh/awesome-deepseek-harness-plugins/${screenshotBranch}/homepage.png?v=${revision}`

  for (const [name, content] of Object.entries(files)) {
    assert.ok(content.includes(source), `${name} must embed the versioned screenshot URL`)
    // The hero links to the live site and sits above the fold, before the nav links.
    assert.ok(content.indexOf(source) < content.indexOf('Submit a plugin') || name === 'README.md')
    assert.match(content, /\]\(https:\/\/deepseek1024\.com\/\)/)
  }
  assert.match(files['README.md'], /\[!\[DSH 1024Store 插件市场首页\]/)
  assert.match(files['catalog/README.md'], /\[!\[The DSH 1024Store plugin marketplace homepage\]/)
})

test('ties the screenshot URL to catalog contents, not to the clock', () => {
  const base = normalizeRegistry(registryFixture)
  // Same catalog → same URL, so an unchanged sync produces no README commit at all.
  assert.equal(catalogRevision(base), catalogRevision(normalizeRegistry(registryFixture)))

  // A new plugin changes the revision, so readers get a fresh screenshot past camo.
  const grown = normalizeRegistry({
    ...registryFixture,
    plugins: [...registryFixture.plugins, {
      ...registryFixture.plugins[0],
      id: 'owner/brand-new',
      url: 'https://github.com/owner/brand-new',
      name: 'brand-new',
    }],
  })
  assert.notEqual(catalogRevision(base), catalogRevision(grown))

  // Recategorising an existing plugin also moves it in the list, so it counts too.
  const recategorised = normalizeRegistry({
    ...registryFixture,
    plugins: registryFixture.plugins.map((plugin, index) => (index === 0 ? { ...plugin, category: 'ui' } : plugin)),
  })
  assert.notEqual(catalogRevision(base), catalogRevision(recategorised))

  assert.match(catalogRevision(base), /^[0-9a-f]{12}$/)
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
      install: 'dsh plugin --profile web add github:Owner/Repo-Name',
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
