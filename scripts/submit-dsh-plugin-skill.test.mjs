import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const script = path.join(root, 'skills/submit-dsh-plugin/scripts/create-catalog-entry.mjs')
const categories = {
  version: 1,
  categories: [
    { id: 'tools', order: 10, label: { en: 'Tools', zh: '工具' } },
    { id: 'skill', order: 20, label: { en: 'Skills', zh: '技能' } },
  ],
}

async function fixture(entries = []) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'submit-dsh-plugin-'))
  await mkdir(path.join(directory, 'catalog/plugins'), { recursive: true })
  await writeFile(path.join(directory, 'catalog/categories.json'), `${JSON.stringify(categories)}\n`)
  for (const [file, entry] of entries) {
    await writeFile(path.join(directory, 'catalog/plugins', file), `${JSON.stringify(entry)}\n`)
  }
  return directory
}

function run(directory, ...arguments_) {
  return spawnSync(process.execPath, [
    script,
    '--catalog-root', directory,
    ...arguments_,
  ], { encoding: 'utf8' })
}

test('creates the exact normalized catalog entry', async t => {
  const directory = await fixture()
  t.after(() => rm(directory, { recursive: true, force: true }))

  const result = run(
    directory,
    '--id', 'Example-Org/My.Plugin',
    '--category', 'skill',
    '--description-en', 'A portable skill example.',
    '--description-zh', '一个可移植的技能示例。',
    '--added', '2026-08-14',
  )
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /已创建 catalog\/plugins\/example-org--my-plugin\.json/)

  const entry = JSON.parse(await readFile(
    path.join(directory, 'catalog/plugins/example-org--my-plugin.json'),
    'utf8',
  ))
  assert.deepEqual(entry, {
    $schema: '../schema/plugin.schema.json',
    id: 'Example-Org/My.Plugin',
    name: 'My.Plugin',
    repository: 'https://github.com/Example-Org/My.Plugin',
    category: 'skill',
    description: {
      en: 'A portable skill example.',
      zh: '一个可移植的技能示例。',
    },
    added: '2026-08-14',
  })
})

test('rejects duplicate repositories case-insensitively', async t => {
  const existing = {
    id: 'owner/plugin',
    repository: 'https://github.com/owner/plugin',
  }
  const directory = await fixture([['owner--plugin.json', existing]])
  t.after(() => rm(directory, { recursive: true, force: true }))

  const result = run(
    directory,
    '--id', 'OWNER/PLUGIN',
    '--category', 'tools',
    '--description-en', 'A duplicate.',
    '--description-zh', '重复条目。',
  )
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /已存在/)
})

test('rejects unknown categories', async t => {
  const directory = await fixture()
  t.after(() => rm(directory, { recursive: true, force: true }))

  const result = run(
    directory,
    '--id', 'owner/plugin',
    '--category', 'unknown',
    '--description-en', 'An invalid category.',
    '--description-zh', '无效分类。',
  )
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /未知分类“unknown”/)
})

test('dry-run prints JSON without creating a file', async t => {
  const directory = await fixture()
  t.after(() => rm(directory, { recursive: true, force: true }))

  const result = run(
    directory,
    '--id', 'owner/plugin',
    '--category', 'tools',
    '--description-en', 'A dry-run plugin.',
    '--description-zh', '试运行插件。',
    '--added', '2026-08-14',
    '--dry-run',
  )
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).id, 'owner/plugin')
  await assert.rejects(readFile(path.join(directory, 'catalog/plugins/owner--plugin.json')))
})
