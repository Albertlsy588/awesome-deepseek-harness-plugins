import assert from 'node:assert/strict'
import test from 'node:test'

import {
  RepositoryRejection,
  buildDiscoveryReport,
  collectRepositories,
  discoverRepositories,
  inspectRepository,
  parseArguments,
  resolveRootPatchPath,
  validateRootManifest,
} from './collect-dsh-plugins.mjs'

function content(value) {
  const source = typeof value === 'string' ? value : JSON.stringify(value)
  return {
    type: 'file',
    encoding: 'base64',
    content: Buffer.from(source).toString('base64'),
  }
}

function repository(id, overrides = {}) {
  const [owner, name] = id.split('/')
  return {
    id: overrides.id ?? id,
    name,
    full_name: id,
    html_url: `https://github.com/${owner}/${name}`,
    description: `${name} description`,
    default_branch: 'main',
    fork: false,
    archived: false,
    disabled: false,
    stargazers_count: 10,
    language: 'TypeScript',
    license: { spdx_id: 'MIT' },
    pushed_at: '2026-08-14T00:00:00Z',
    ...overrides,
  }
}

function contentClient(responses) {
  return {
    async request(apiPath, options) {
      if (responses.has(apiPath)) return responses.get(apiPath)
      if (options?.allowNotFound === true) return undefined
      throw new Error(`Unexpected API path: ${apiPath}`)
    },
  }
}

test('validates a root dsh bundle manifest and normalizes its patch path', () => {
  assert.deepEqual(validateRootManifest(JSON.stringify({
    name: 'dsh-example',
    version: '1.2.3',
    dsh: { bundle: { patch: './config/cordis.patch.yml' } },
  })), {
    name: 'dsh-example',
    version: '1.2.3',
    patch: 'config/cordis.patch.yml',
  })
})

test('rejects missing or nested-only dsh bundle declarations', () => {
  assert.throws(
    () => validateRootManifest(JSON.stringify({ name: 'monorepo', private: true })),
    error => error instanceof RepositoryRejection && error.code === 'missing_root_bundle',
  )
})

test('rejects bundle patch paths outside the repository', () => {
  for (const patch of ['../cordis.patch.yml', '/cordis.patch.yml', '..\\cordis.patch.yml', '']) {
    assert.throws(
      () => resolveRootPatchPath(patch),
      error => error instanceof RepositoryRejection && error.code === 'invalid_bundle_patch',
    )
  }
})

test('accepts an installable root package whose patch exists', async () => {
  const candidate = repository('owner/dsh-example')
  const client = contentClient(new Map([
    ['/repos/owner/dsh-example/contents/package.json?ref=main', content({
      name: 'dsh-example',
      version: '0.1.0',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    })],
    ['/repos/owner/dsh-example/contents/cordis.patch.yml?ref=main', content('- insert: []\n')],
  ]))
  const result = await inspectRepository(candidate, client)
  assert.deepEqual(result.package, {
    name: 'dsh-example',
    version: '0.1.0',
    patch: 'cordis.patch.yml',
  })
  assert.equal(result.id, 'owner/dsh-example')
})

test('rejects a root manifest whose declared patch is absent', async () => {
  const candidate = repository('owner/missing-patch')
  const client = contentClient(new Map([
    ['/repos/owner/missing-patch/contents/package.json?ref=main', content({
      name: 'missing-patch',
      dsh: { bundle: { patch: './missing.yml' } },
    })],
  ]))
  await assert.rejects(
    inspectRepository(candidate, client),
    error => error instanceof RepositoryRejection && error.code === 'missing_bundle_patch',
  )
})

test('classifies the first three topic repositories with the strict policy', async () => {
  const repositories = [
    repository('nexu-io/open-design', { stargazers_count: 85_700 }),
    repository('deepseek-ai/deepseek-harness', { stargazers_count: 75_200, default_branch: 'master' }),
    repository('titanwings/colleague-skill', { stargazers_count: 20_000, default_branch: 'dot-skill' }),
  ]
  const client = contentClient(new Map([
    ['/repos/nexu-io/open-design/contents/package.json?ref=main', content({
      name: 'open-design',
      private: true,
      workspaces: ['packages/*'],
    })],
  ]))
  const result = await collectRepositories(repositories, client, { concurrency: 2 })
  assert.equal(result.accepted.length, 0)
  assert.deepEqual(result.rejected.map(item => [item.id, item.code]), [
    ['nexu-io/open-design', 'missing_root_bundle'],
    ['deepseek-ai/deepseek-harness', 'excluded_repository'],
    ['titanwings/colleague-skill', 'missing_root_package'],
  ])
})

test('discovers a limited, star-sorted topic page through GitHub search', async () => {
  const requested = []
  const client = {
    async request(apiPath) {
      requested.push(apiPath)
      return {
        total_count: 1395,
        incomplete_results: false,
        items: [
          repository('owner/first', { id: 1, stargazers_count: 30 }),
          repository('owner/second', { id: 2, stargazers_count: 20 }),
          repository('owner/third', { id: 3, stargazers_count: 10 }),
        ],
      }
    },
  }
  const result = await discoverRepositories(client, 'dsh-plugin', { limit: 3 })
  assert.equal(result.totalCount, 1395)
  assert.deepEqual(result.repositories.map(item => item.full_name), [
    'owner/first',
    'owner/second',
    'owner/third',
  ])
  assert.match(requested[0], /^\/search\/repositories\?/)
  const search = new URL(requested[0], 'https://api.github.com').searchParams
  assert.equal(search.get('q'), 'topic:dsh-plugin fork:false archived:false')
  assert.match(requested[0], /per_page=3/)
})

test('partitions a topic with more than one thousand results by creation date', async () => {
  let createdQueries = 0
  const client = {
    async request(apiPath) {
      const search = new URL(apiPath, 'https://api.github.com').searchParams
      const query = search.get('q')
      if (!query.includes('created:')) {
        return { total_count: 1500, incomplete_results: false, items: [] }
      }
      createdQueries += 1
      if (createdQueries === 1) {
        return { total_count: 1500, incomplete_results: false, items: [] }
      }
      const item = createdQueries === 2
        ? repository('owner/older', { id: 1, stargazers_count: 5 })
        : repository('owner/newer', { id: 2, stargazers_count: 10 })
      return { total_count: 1, incomplete_results: false, items: [item] }
    },
  }
  const result = await discoverRepositories(client, 'dsh-plugin', {
    now: new Date('2026-08-14T00:00:00.000Z'),
  })
  assert.equal(result.totalCount, 1500)
  assert.equal(createdQueries, 3)
  assert.deepEqual(result.repositories.map(item => item.full_name), [
    'owner/newer',
    'owner/older',
  ])
})

test('builds a report that separates new candidates from cataloged plugins', () => {
  const accepted = [
    { id: 'owner/new', cataloged: false },
    { id: 'owner/known', cataloged: true },
  ]
  const report = buildDiscoveryReport({
    now: new Date('2026-08-14T01:02:03.000Z'),
    topic: 'dsh-plugin',
    totalCount: 12,
    inspectedCount: 3,
    accepted,
    rejected: [{ id: 'owner/nope' }],
  })
  assert.equal(report.generatedAt, '2026-08-14T01:02:03.000Z')
  assert.equal(report.acceptedRepositories, 2)
  assert.equal(report.newCandidates, 1)
  assert.equal(report.rejectedRepositories, 1)
})

test('parses portable collector CLI options', () => {
  const options = parseArguments([
    '--topic', 'dsh-plugin',
    '--limit', '3',
    '--concurrency', '2',
    '--exclude', 'owner/repo',
    '--output', 'tmp/report.json',
    '--dry-run',
  ])
  assert.equal(options.limit, 3)
  assert.equal(options.concurrency, 2)
  assert.equal(options.output, 'tmp/report.json')
  assert.equal(options.dryRun, true)
  assert.equal(options.excludedRepositories.has('owner/repo'), true)
})
