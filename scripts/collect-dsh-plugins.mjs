#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultTopic = 'dsh-plugin'
const defaultOutput = 'catalog/generated/dsh-plugin-discovery.json'
const searchResultLimit = 1000
const firstGitHubDate = '2008-01-01'

export const defaultExcludedRepositories = new Set([
  'deepseek-ai/deepseek-harness',
])

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function encodeRepository(id) {
  const parts = id.split('/')
  if (parts.length !== 2 || parts.some(part => !/^[A-Za-z0-9_.-]+$/.test(part))) {
    throw new Error(`Invalid GitHub repository: ${id}`)
  }
  return parts.map(encodeURIComponent).join('/')
}

function encodeContentPath(file) {
  return file.split('/').map(encodeURIComponent).join('/')
}

function decodeContent(value, label) {
  if (!isObject(value) || value.type !== 'file' || value.encoding !== 'base64' || typeof value.content !== 'string') {
    throw new RepositoryRejection('unreadable_file', `${label} is not a readable regular file`)
  }
  return Buffer.from(value.content.replaceAll('\n', ''), 'base64').toString('utf8')
}

export class RepositoryRejection extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'RepositoryRejection'
    this.code = code
  }
}

export class GitHubApiError extends Error {
  constructor(status, apiPath, detail) {
    super(`GitHub API ${status} for ${apiPath}: ${detail}`)
    this.name = 'GitHubApiError'
    this.status = status
    this.apiPath = apiPath
  }
}

export function resolveRootPatchPath(patch) {
  if (typeof patch !== 'string' || patch.trim().length === 0) {
    throw new RepositoryRejection('invalid_bundle_patch', 'package.json dsh.bundle.patch must be a non-empty string')
  }
  const candidate = patch.trim()
  if (path.posix.isAbsolute(candidate) || candidate.includes('\\')) {
    throw new RepositoryRejection('invalid_bundle_patch', `package.json has an invalid dsh.bundle.patch path: ${candidate}`)
  }
  const resolved = path.posix.normalize(candidate)
  if (resolved === '.' || resolved === '..' || resolved.startsWith('../')) {
    throw new RepositoryRejection('invalid_bundle_patch', `package.json dsh.bundle.patch points outside the repository: ${candidate}`)
  }
  return resolved.replace(/^\.\//, '')
}

export function validateRootManifest(source) {
  let manifest
  try {
    manifest = JSON.parse(source)
  } catch (error) {
    throw new RepositoryRejection(
      'invalid_root_package',
      `Root package.json is invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (!isObject(manifest)) {
    throw new RepositoryRejection('invalid_root_package', 'Root package.json must contain a JSON object')
  }
  if (typeof manifest.name !== 'string' || manifest.name.trim().length === 0) {
    throw new RepositoryRejection('invalid_root_package', 'Root package.json must declare a non-empty package name')
  }
  const bundle = isObject(manifest.dsh) && isObject(manifest.dsh.bundle)
    ? manifest.dsh.bundle
    : undefined
  if (bundle === undefined) {
    throw new RepositoryRejection('missing_root_bundle', 'Root package.json does not declare dsh.bundle')
  }
  return {
    name: manifest.name.trim(),
    version: typeof manifest.version === 'string' && manifest.version.trim().length > 0
      ? manifest.version.trim()
      : null,
    patch: resolveRootPatchPath(bundle.patch),
  }
}

export function createGitHubClient(token, fetchImplementation = globalThis.fetch) {
  assert(typeof fetchImplementation === 'function', 'A fetch implementation is required')
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'dsh-store-topic-collector',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(typeof token === 'string' && token.length > 0 ? { Authorization: `Bearer ${token}` } : {}),
  }

  return {
    async request(apiPath, options = {}) {
      const response = await fetchImplementation(`https://api.github.com${apiPath}`, { headers })
      if (response.status === 404 && options.allowNotFound === true) return undefined
      const detail = await response.text()
      if (!response.ok) {
        let message = detail.slice(0, 500)
        try {
          const parsed = JSON.parse(detail)
          if (typeof parsed.message === 'string') message = parsed.message
        } catch {
          // Keep the response text when GitHub did not return JSON.
        }
        throw new GitHubApiError(response.status, apiPath, message)
      }
      return detail.length === 0 ? undefined : JSON.parse(detail)
    },
  }
}

async function repositoryContent(client, id, file, branch) {
  const repository = encodeRepository(id)
  const contentPath = encodeContentPath(file)
  const query = new URLSearchParams({ ref: branch })
  return client.request(`/repos/${repository}/contents/${contentPath}?${query}`, { allowNotFound: true })
}

function rejection(repository, error) {
  const known = error instanceof RepositoryRejection
  return {
    id: repository.full_name,
    repository: repository.html_url ?? `https://github.com/${repository.full_name}`,
    code: known ? error.code : 'inspection_error',
    reason: error instanceof Error ? error.message : String(error),
  }
}

export async function inspectRepository(repository, client, options = {}) {
  if (!isObject(repository) || typeof repository.full_name !== 'string') {
    throw new Error('GitHub search returned an invalid repository')
  }
  const normalizedId = repository.full_name.toLocaleLowerCase('en-US')
  const excluded = options.excludedRepositories ?? defaultExcludedRepositories
  if ([...excluded].some(id => id.toLocaleLowerCase('en-US') === normalizedId)) {
    throw new RepositoryRejection('excluded_repository', `${repository.full_name} is excluded from the community plugin catalog`)
  }
  if (repository.fork === true) throw new RepositoryRejection('fork', 'Fork repositories are not collected')
  if (repository.archived === true) throw new RepositoryRejection('archived', 'Archived repositories are not collected')
  if (repository.disabled === true) throw new RepositoryRejection('disabled', 'Disabled repositories are not collected')
  if (typeof repository.default_branch !== 'string' || repository.default_branch.length === 0) {
    throw new RepositoryRejection('missing_default_branch', 'Repository has no default branch')
  }

  const packageContent = await repositoryContent(client, repository.full_name, 'package.json', repository.default_branch)
  if (packageContent === undefined) {
    throw new RepositoryRejection('missing_root_package', 'Repository has no root package.json')
  }
  const manifest = validateRootManifest(decodeContent(packageContent, 'package.json'))
  const patchContent = await repositoryContent(client, repository.full_name, manifest.patch, repository.default_branch)
  if (patchContent === undefined) {
    throw new RepositoryRejection('missing_bundle_patch', `dsh.bundle.patch does not exist: ${manifest.patch}`)
  }
  decodeContent(patchContent, manifest.patch)

  return {
    id: repository.full_name,
    name: repository.name ?? repository.full_name.split('/').at(-1),
    repository: repository.html_url ?? `https://github.com/${repository.full_name}`,
    description: typeof repository.description === 'string' ? repository.description : null,
    defaultBranch: repository.default_branch,
    stars: Number.isInteger(repository.stargazers_count) ? repository.stargazers_count : 0,
    language: typeof repository.language === 'string' ? repository.language : null,
    license: typeof repository.license?.spdx_id === 'string' ? repository.license.spdx_id : null,
    pushedAt: typeof repository.pushed_at === 'string' ? repository.pushed_at : null,
    package: manifest,
  }
}

function searchQuery(topic, createdRange) {
  const terms = [`topic:${topic}`, 'fork:false', 'archived:false']
  if (createdRange !== undefined) terms.push(`created:${createdRange.start}..${createdRange.end}`)
  return terms.join(' ')
}

async function searchPage(client, topic, options = {}) {
  const query = searchQuery(topic, options.createdRange)
  const parameters = new URLSearchParams({
    q: query,
    sort: 'stars',
    order: 'desc',
    per_page: String(options.perPage ?? 100),
    page: String(options.page ?? 1),
  })
  const result = await client.request(`/search/repositories?${parameters}`)
  if (!isObject(result) || !Number.isInteger(result.total_count) || !Array.isArray(result.items)) {
    throw new Error('GitHub repository search returned an invalid response')
  }
  if (result.incomplete_results === true) {
    throw new Error(`GitHub repository search was incomplete for query: ${query}`)
  }
  return result
}

async function remainingSearchPages(client, topic, first, options = {}) {
  const maximum = Math.min(first.total_count, searchResultLimit, options.limit ?? Number.POSITIVE_INFINITY)
  const items = first.items.slice(0, maximum)
  const perPage = options.perPage ?? 100
  const pages = Math.ceil(maximum / perPage)
  for (let page = 2; page <= pages; page += 1) {
    const result = await searchPage(client, topic, {
      createdRange: options.createdRange,
      page,
      perPage,
    })
    items.push(...result.items)
  }
  return items.slice(0, maximum)
}

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function midpointDate(start, end) {
  const left = new Date(`${start}T00:00:00.000Z`).getTime()
  const right = new Date(`${end}T00:00:00.000Z`).getTime()
  return new Date(left + Math.floor((right - left) / 2)).toISOString().slice(0, 10)
}

async function collectDateRange(client, topic, createdRange) {
  const first = await searchPage(client, topic, { createdRange, page: 1, perPage: 100 })
  if (first.total_count <= searchResultLimit) {
    return remainingSearchPages(client, topic, first, { createdRange, perPage: 100 })
  }
  if (createdRange.start === createdRange.end) {
    throw new Error(`More than ${searchResultLimit} repositories were created on ${createdRange.start}; cannot exhaust GitHub Search API results`)
  }
  const midpoint = midpointDate(createdRange.start, createdRange.end)
  const next = addDays(midpoint, 1)
  const left = await collectDateRange(client, topic, { start: createdRange.start, end: midpoint })
  const right = await collectDateRange(client, topic, { start: next, end: createdRange.end })
  return [...left, ...right]
}

function compareRepositories(left, right) {
  return (right.stargazers_count ?? 0) - (left.stargazers_count ?? 0)
    || left.full_name.localeCompare(right.full_name, 'en-US')
}

function uniqueRepositories(repositories) {
  const unique = new Map()
  for (const repository of repositories) unique.set(repository.id ?? repository.full_name, repository)
  return [...unique.values()].sort(compareRepositories)
}

export async function discoverRepositories(client, topic, options = {}) {
  const first = await searchPage(client, topic, {
    page: 1,
    perPage: options.limit === undefined ? 100 : Math.min(options.limit, 100),
  })
  if (options.limit !== undefined) {
    const repositories = await remainingSearchPages(client, topic, first, {
      limit: options.limit,
      perPage: Math.min(options.limit, 100),
    })
    return { totalCount: first.total_count, repositories: uniqueRepositories(repositories) }
  }
  if (first.total_count <= searchResultLimit) {
    const repositories = await remainingSearchPages(client, topic, first, { perPage: 100 })
    return { totalCount: first.total_count, repositories: uniqueRepositories(repositories) }
  }
  const end = (options.now ?? new Date()).toISOString().slice(0, 10)
  const repositories = await collectDateRange(client, topic, { start: firstGitHubDate, end })
  return { totalCount: first.total_count, repositories: uniqueRepositories(repositories) }
}

async function mapWithConcurrency(values, concurrency, callback) {
  const results = new Array(values.length)
  let next = 0
  async function worker() {
    while (next < values.length) {
      const index = next
      next += 1
      results[index] = await callback(values[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()))
  return results
}

export async function collectRepositories(repositories, client, options = {}) {
  const knownCatalogIds = options.knownCatalogIds ?? new Set()
  const outcomes = await mapWithConcurrency(repositories, options.concurrency ?? 5, async repository => {
    try {
      const accepted = await inspectRepository(repository, client, options)
      return {
        accepted: {
          ...accepted,
          cataloged: [...knownCatalogIds].some(id => id.toLocaleLowerCase('en-US') === accepted.id.toLocaleLowerCase('en-US')),
        },
      }
    } catch (error) {
      return { rejected: rejection(repository, error) }
    }
  })
  return {
    accepted: outcomes.flatMap(outcome => outcome.accepted === undefined ? [] : [outcome.accepted]),
    rejected: outcomes.flatMap(outcome => outcome.rejected === undefined ? [] : [outcome.rejected]),
  }
}

export function buildDiscoveryReport(input) {
  const newCandidates = input.accepted.filter(repository => repository.cataloged === false)
  return {
    version: 1,
    generatedAt: input.now.toISOString(),
    topic: input.topic,
    query: searchQuery(input.topic),
    totalTopicRepositories: input.totalCount,
    inspectedRepositories: input.inspectedCount,
    acceptedRepositories: input.accepted.length,
    newCandidates: newCandidates.length,
    rejectedRepositories: input.rejected.length,
    accepted: input.accepted,
    rejected: input.rejected,
  }
}

async function loadKnownCatalogIds(root) {
  const directory = path.join(root, 'catalog/plugins')
  const files = (await readdir(directory)).filter(file => file.endsWith('.json'))
  const ids = new Set()
  for (const file of files) {
    const value = JSON.parse(await readFile(path.join(directory, file), 'utf8'))
    if (typeof value.id === 'string') ids.add(value.id)
  }
  return ids
}

export function parseArguments(argv) {
  const options = {
    topic: defaultTopic,
    output: defaultOutput,
    concurrency: 5,
    excludedRepositories: new Set(defaultExcludedRepositories),
    dryRun: false,
    help: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    const value = () => {
      const next = argv[index + 1]
      if (next === undefined || next.startsWith('--')) throw new Error(`${argument} requires a value`)
      index += 1
      return next
    }
    if (argument === '--topic') options.topic = value()
    else if (argument === '--output') options.output = value()
    else if (argument === '--limit') options.limit = Number(value())
    else if (argument === '--concurrency') options.concurrency = Number(value())
    else if (argument === '--exclude') options.excludedRepositories.add(value())
    else if (argument === '--dry-run') options.dryRun = true
    else if (argument === '--help' || argument === '-h') options.help = true
    else throw new Error(`Unknown argument: ${argument}`)
  }
  assert(/^[a-z0-9][a-z0-9-]{0,49}$/.test(options.topic), 'Topic must contain lowercase letters, numbers, or hyphens')
  if (options.limit !== undefined) assert(Number.isInteger(options.limit) && options.limit > 0, '--limit must be a positive integer')
  if (options.limit !== undefined) assert(options.limit <= searchResultLimit, `--limit cannot exceed ${searchResultLimit}; omit it to collect the complete topic`)
  assert(Number.isInteger(options.concurrency) && options.concurrency > 0 && options.concurrency <= 20, '--concurrency must be an integer from 1 to 20')
  return options
}

function usage() {
  return `Usage: npm run plugin:collect -- [options]

Options:
  --topic <topic>          GitHub repository topic (default: ${defaultTopic})
  --limit <count>          Inspect only the top repositories by stars
  --concurrency <count>    Concurrent repository checks, 1-20 (default: 5)
  --exclude <owner/repo>   Exclude an additional repository; repeatable
  --output <file>          Discovery report path (default: ${defaultOutput})
  --dry-run                Print the report without writing a file
  --help                   Show this help

Authentication:
  Set GITHUB_TOKEN or GH_TOKEN. Anonymous requests only suit very small smoke tests.`
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
  if (token === undefined || token.length === 0) {
    console.error('Warning: GITHUB_TOKEN/GH_TOKEN is unset; GitHub limits anonymous API requests to small test runs.')
  }
  const now = new Date()
  const client = createGitHubClient(token)
  const discovered = await discoverRepositories(client, options.topic, { limit: options.limit, now })
  const knownCatalogIds = await loadKnownCatalogIds(scriptRoot)
  const collected = await collectRepositories(discovered.repositories, client, {
    concurrency: options.concurrency,
    excludedRepositories: options.excludedRepositories,
    knownCatalogIds,
  })
  const report = buildDiscoveryReport({
    now,
    topic: options.topic,
    totalCount: discovered.totalCount,
    inspectedCount: discovered.repositories.length,
    ...collected,
  })
  const serialized = `${JSON.stringify(report, null, 2)}\n`
  if (options.dryRun) {
    process.stdout.write(serialized)
  } else {
    const output = path.resolve(scriptRoot, options.output)
    await mkdir(path.dirname(output), { recursive: true })
    await writeFile(output, serialized)
    console.log(`Wrote ${path.relative(scriptRoot, output)}`)
  }
  console.error(`Inspected ${report.inspectedRepositories}: ${report.acceptedRepositories} accepted (${report.newCandidates} new), ${report.rejectedRepositories} rejected`)
}

if (process.argv[1] !== undefined && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    await main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
