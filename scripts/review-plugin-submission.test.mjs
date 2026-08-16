import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  findHarnessBundle,
  parseNameStatus,
  pullRequestChanges,
  readCatalogEntry,
  reviewComment,
  reviewRepository,
  upsertReviewComment,
  validateCatalogEntry,
  validateSubmissionChanges,
} from './review-plugin-submission.mjs'

function blob(value) {
  return {
    encoding: 'base64',
    content: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64'),
  }
}

function repositoryClient(tree, blobs) {
  return {
    async request(apiPath) {
      if (apiPath === '/repos/owner/plugin') return { default_branch: 'main' }
      if (apiPath === '/repos/owner/plugin/commits/main') return { commit: { tree: { sha: 'tree-sha' } } }
      if (apiPath === '/repos/owner/plugin/git/trees/tree-sha?recursive=1') return { tree, truncated: false }
      const sha = apiPath.split('/').at(-1)
      if (blobs.has(sha)) return blobs.get(sha)
      throw new Error(`Unexpected API path: ${apiPath}`)
    },
  }
}

test('parses null-delimited git statuses including renames', () => {
  assert.deepEqual(parseNameStatus('A\0catalog/plugins/owner--plugin.json\0R100\0old\0new\0'), [
    { status: 'A', file: 'catalog/plugins/owner--plugin.json' },
    { status: 'R100', oldPath: 'old', file: 'new' },
  ])
})

test('reads pull request changes from GitHub', async () => {
  const changes = await pullRequestChanges('owner/catalog', '42', {
    async request(apiPath) {
      assert.equal(apiPath, '/repos/owner/catalog/pulls/42/files?per_page=100')
      return [
        { status: 'added', filename: 'catalog/plugins/owner--plugin.json' },
        { status: 'renamed', previous_filename: 'old.json', filename: 'new.json' },
      ]
    },
  })
  assert.deepEqual(changes, [
    { status: 'A', file: 'catalog/plugins/owner--plugin.json' },
    { status: 'R', oldPath: 'old.json', file: 'new.json' },
  ])
})

test('creates and updates one persistent review comment', async () => {
  const created = []
  const createClient = {
    async request(apiPath, options) {
      if (apiPath.endsWith('/comments?per_page=100')) return []
      created.push({ apiPath, options })
      return {}
    },
  }
  await upsertReviewComment('owner/catalog', '42', createClient, reviewComment('failed', 'bad file'))
  assert.equal(created[0].apiPath, '/repos/owner/catalog/issues/42/comments')
  assert.equal(created[0].options.method, 'POST')
  assert.match(JSON.parse(created[0].options.body).body, /Plugin submission review failed/)

  const updated = []
  const updateClient = {
    async request(apiPath, options) {
      if (apiPath.endsWith('/comments?per_page=100')) {
        return [{
          id: 99,
          body: '<!-- dsh-plugin-submission-review -->\nold result',
          user: { login: 'github-actions[bot]' },
        }]
      }
      updated.push({ apiPath, options })
      return {}
    },
  }
  await upsertReviewComment('owner/catalog', '42', updateClient, reviewComment('passed', 'all checks passed'))
  assert.equal(updated[0].apiPath, '/repos/owner/catalog/issues/comments/99')
  assert.equal(updated[0].options.method, 'PATCH')
})

test('renders a distinct maintainer-review comment', () => {
  const body = reviewComment('manual-review', 'All static checks passed for this change set:\n\n- M catalog/plugins/owner--plugin.json')
  assert.match(body, /maintainer/i)
  assert.match(body, /not (be )?merged automatically/i)
  assert.match(body, /- M catalog\/plugins\/owner--plugin\.json/)
  assert.doesNotMatch(body, /review failed/i)
})

test('auto-merges exactly one new plugin JSON file', () => {
  assert.deepEqual(validateSubmissionChanges([
    { status: 'A', file: 'catalog/plugins/owner--plugin.json' },
  ]), {
    verdict: 'auto-merge',
    reviewables: ['catalog/plugins/owner--plugin.json'],
    deletions: [],
    changes: [{ status: 'A', file: 'catalog/plugins/owner--plugin.json' }],
  })
})

test('routes catalog entry modifications to manual review', () => {
  const result = validateSubmissionChanges([
    { status: 'M', file: 'catalog/plugins/owner--plugin.json' },
  ])
  assert.equal(result.verdict, 'manual-review')
  assert.deepEqual(result.reviewables, ['catalog/plugins/owner--plugin.json'])
  assert.deepEqual(result.deletions, [])
})

test('routes catalog entry deletions to manual review without content checks', () => {
  const result = validateSubmissionChanges([
    { status: 'D', file: 'catalog/plugins/owner--plugin.json' },
  ])
  assert.equal(result.verdict, 'manual-review')
  assert.deepEqual(result.reviewables, [])
  assert.deepEqual(result.deletions, ['catalog/plugins/owner--plugin.json'])
})

test('routes catalog renames to manual review and validates the new path', () => {
  const result = validateSubmissionChanges([
    { status: 'R100', oldPath: 'catalog/plugins/owner--old.json', file: 'catalog/plugins/owner--new.json' },
  ])
  assert.equal(result.verdict, 'manual-review')
  assert.deepEqual(result.reviewables, ['catalog/plugins/owner--new.json'])
})

test('routes multiple additions to manual review', () => {
  const result = validateSubmissionChanges([
    { status: 'A', file: 'catalog/plugins/owner--one.json' },
    { status: 'A', file: 'catalog/plugins/owner--two.json' },
  ])
  assert.equal(result.verdict, 'manual-review')
  assert.deepEqual(result.reviewables, ['catalog/plugins/owner--one.json', 'catalog/plugins/owner--two.json'])
})

test('routes mixed additions and deletions to manual review', () => {
  const result = validateSubmissionChanges([
    { status: 'A', file: 'catalog/plugins/owner--one.json' },
    { status: 'D', file: 'catalog/plugins/owner--two.json' },
  ])
  assert.equal(result.verdict, 'manual-review')
  assert.deepEqual(result.reviewables, ['catalog/plugins/owner--one.json'])
  assert.deepEqual(result.deletions, ['catalog/plugins/owner--two.json'])
})

test('rejects renames that leave the catalog directory', () => {
  assert.throws(() => validateSubmissionChanges([
    { status: 'R100', oldPath: 'catalog/plugins/owner--plugin.json', file: 'docs/owner--plugin.json' },
  ]), /unexpected change: R100 catalog\/plugins\/owner--plugin\.json -> docs\/owner--plugin\.json/)
})

test('rejects unsupported change statuses', () => {
  assert.throws(() => validateSubmissionChanges([
    { status: 'T', file: 'catalog/plugins/owner--plugin.json' },
  ]), /unsupported change: T catalog\/plugins\/owner--plugin\.json/)
})

test('rejects empty change sets', () => {
  assert.throws(() => validateSubmissionChanges([]), /must change at least one/)
})

test('validates the submitted catalog entry', () => {
  const entry = {
    $schema: '../schema/plugin.schema.json',
    id: 'owner/plugin',
    name: 'Plugin',
    repository: 'https://github.com/owner/plugin',
    category: 'tools',
    description: { en: 'An example plugin.', zh: '一个示例插件。' },
    added: '2026-08-14',
  }
  assert.equal(
    validateCatalogEntry(entry, 'catalog/plugins/owner--plugin.json', new Set(['tools'])),
    entry,
  )
})

test('reads only regular catalog entry files', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'plugin-review-entry-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await mkdir(path.join(directory, 'catalog/plugins'), { recursive: true })
  const entry = { id: 'owner/plugin' }
  await writeFile(path.join(directory, 'entry.json'), JSON.stringify(entry))
  await symlink('../../entry.json', path.join(directory, 'catalog/plugins/owner--plugin.json'))

  await assert.rejects(
    readCatalogEntry(directory, 'catalog/plugins/owner--plugin.json'),
    /must be a regular file/,
  )
})

test('rejects catalog entries with extra fields or a mismatched filename', () => {
  const entry = {
    $schema: '../schema/plugin.schema.json',
    id: 'owner/plugin',
    name: 'Plugin',
    repository: 'https://github.com/owner/plugin',
    category: 'tools',
    description: { en: 'An example plugin.', zh: '一个示例插件。' },
    added: '2026-08-14',
  }
  assert.throws(
    () => validateCatalogEntry({ ...entry, install: 'arbitrary command' }, 'catalog/plugins/owner--plugin.json', new Set(['tools'])),
    /must contain exactly/,
  )
  assert.throws(
    () => validateCatalogEntry(entry, 'catalog/plugins/wrong.json', new Set(['tools'])),
    /should be named owner--plugin\.json/,
  )
})

test('rejects unrelated files', () => {
  assert.throws(() => validateSubmissionChanges([
    { status: 'A', file: 'catalog/plugins/owner--plugin.json' },
    { status: 'M', file: 'SECURITY.md' },
  ]), /unexpected change: M SECURITY\.md/)
})

test('rejects pull requests touching only non-catalog files', () => {
  assert.throws(() => validateSubmissionChanges([
    { status: 'M', file: 'apps/web/src/App.tsx' },
  ]), /unexpected change: M apps\/web\/src\/App\.tsx/)
})

test('rejects plugin JSON files in nested catalog directories', () => {
  assert.throws(() => validateSubmissionChanges([
    { status: 'A', file: 'catalog/plugins/nested/owner--plugin.json' },
  ]), /unexpected change: A catalog\/plugins\/nested\/owner--plugin\.json/)
})

test('rejects changes to generated projections', () => {
  assert.throws(() => validateSubmissionChanges([
    { status: 'A', file: 'catalog/plugins/owner--plugin.json' },
    { status: 'M', file: 'apps/web/public/plugins.json' },
  ]), /unexpected change: M apps\/web\/public\/plugins\.json/)
})

test('accepts a root package with an existing bundle patch', async () => {
  const tree = [
    { path: 'package.json', type: 'blob', sha: 'package' },
    { path: 'cordis.patch.yml', type: 'blob', sha: 'patch' },
  ]
  const result = await findHarnessBundle(tree, async sha => blob({
    name: 'plugin',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }))
  assert.deepEqual(result, { packagePath: 'package.json', patchPath: 'cordis.patch.yml' })
})

test('accepts a bundle declared by a monorepo subpackage', async () => {
  const tree = [
    { path: 'package.json', type: 'blob', sha: 'root' },
    { path: 'packages/plugin/package.json', type: 'blob', sha: 'plugin' },
    { path: 'packages/plugin/config/cordis.patch.yml', type: 'blob', sha: 'patch' },
  ]
  const blobs = new Map([
    ['root', blob({ private: true, workspaces: ['packages/*'] })],
    ['plugin', blob({ dsh: { bundle: { patch: './config/cordis.patch.yml' } } })],
  ])
  const result = await findHarnessBundle(tree, async sha => blobs.get(sha))
  assert.deepEqual(result, {
    packagePath: 'packages/plugin/package.json',
    patchPath: 'packages/plugin/config/cordis.patch.yml',
  })
})

test('rejects a repository without dsh.bundle.patch', async () => {
  const tree = [{ path: 'package.json', type: 'blob', sha: 'package' }]
  await assert.rejects(
    findHarnessBundle(tree, async () => blob({ dsh: { client: { platform: 'web' } } })),
    /No package\.json declares dsh\.bundle\.patch/,
  )
})

test('rejects a bundle whose patch file is missing', async () => {
  const tree = [{ path: 'package.json', type: 'blob', sha: 'package' }]
  await assert.rejects(
    findHarnessBundle(tree, async () => blob({ dsh: { bundle: { patch: './missing.yml' } } })),
    /dsh\.bundle\.patch does not exist: missing\.yml/,
  )
})

test('reviews the repository at its default branch tree', async () => {
  const tree = [
    { path: 'package.json', type: 'blob', sha: 'package' },
    { path: 'cordis.patch.yml', type: 'blob', sha: 'patch' },
  ]
  const client = repositoryClient(tree, new Map([
    ['package', blob({ dsh: { bundle: { patch: './cordis.patch.yml' } } })],
  ]))
  const result = await reviewRepository({
    id: 'owner/plugin',
    repository: 'https://github.com/owner/plugin',
  }, client)
  assert.equal(result.packagePath, 'package.json')
})
