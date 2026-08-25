#!/usr/bin/env node

import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { assert, categoryIdSet, isObject, loadCatalogEntries, readCategories } from './lib/catalog-entry.mjs'

const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const defaultSyncUrl = 'https://deepseek1024.com/api/v1/catalog/sync'

/**
 * Categories travel to the Worker as data, not as vendored code.
 *
 * catalog/categories.json stays the human source of truth here (submission
 * validation and README generation read it); the sync endpoint reconciles the
 * `catalog_categories` D1 table to exactly the list posted below, so a category
 * change reaches the site through this workflow instead of a coordinated deploy
 * of the dsh-1024store Worker.
 */
function syncCategory(category) {
  assert(isObject(category), 'catalog/categories.json entries must be objects')
  assert(typeof category.id === 'string' && category.id.length > 0, 'a category is missing its id')
  assert(Number.isInteger(category.order), `category ${category.id} is missing an integer order`)
  assert(isObject(category.label), `category ${category.id} is missing its label object`)
  for (const locale of ['en', 'zh']) {
    assert(typeof category.label[locale] === 'string' && category.label[locale].length > 0, `category ${category.id} is missing its ${locale} label`)
  }
  return { id: category.id, order: category.order, label: { en: category.label.en, zh: category.label.zh } }
}

export function buildSyncBody(entries, categories) {
  const body = { source: 'github_ci' }
  if (categories !== undefined) body.categories = categories.map(syncCategory)
  body.entries = entries.map(entry => ({
    id: entry.id,
    name: entry.name,
    repository: entry.repository,
    category: entry.category,
    description: {
      en: entry.description.en,
      zh: entry.description.zh,
    },
    added: entry.added,
  }))
  return body
}

export function resolveSyncConfig(env, options = {}) {
  const url = env.CATALOG_SYNC_URL !== undefined && env.CATALOG_SYNC_URL.length > 0
    ? env.CATALOG_SYNC_URL
    : defaultSyncUrl
  if (options.dryRun === true) return { url, token: undefined }
  const token = env.CATALOG_SYNC_TOKEN
  if (typeof token !== 'string' || token.trim().length === 0) {
    throw new Error('CATALOG_SYNC_TOKEN is not set. Configure the repository secret (or export the variable) before running catalog:sync, or pass --dry-run to preview the request body.')
  }
  return { url, token: token.trim() }
}

export async function postCatalogSync({ url, token, body, fetchImplementation = globalThis.fetch }) {
  assert(typeof fetchImplementation === 'function', 'A fetch implementation is required')
  const response = await fetchImplementation(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'dsh-1024store-catalog-sync',
    },
    body: JSON.stringify(body),
  })
  const detail = await response.text()
  if (!response.ok) {
    throw new Error(`Catalog sync failed: HTTP ${response.status} for ${url}: ${detail.slice(0, 500)}`)
  }
  let result
  try {
    result = JSON.parse(detail)
  } catch {
    throw new Error(`Catalog sync returned a non-JSON response: ${detail.slice(0, 200)}`)
  }
  if (result?.ok !== true) {
    throw new Error(`Catalog sync was not acknowledged: ${detail.slice(0, 500)}`)
  }
  return result
}

export function parseArguments(argv) {
  const options = { root: scriptRoot, dryRun: false, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--dry-run') options.dryRun = true
    else if (argument === '--help' || argument === '-h') options.help = true
    else if (argument === '--root') {
      const next = argv[index + 1]
      if (next === undefined || next.startsWith('--')) throw new Error('--root requires a value')
      options.root = path.resolve(next)
      index += 1
    } else throw new Error(`Unknown argument: ${argument}`)
  }
  return options
}

function usage() {
  return `Usage: npm run catalog:sync [-- options]

Pushes every catalog/plugins/*.json entry plus the ordered catalog/categories.json
list to POST /api/v1/catalog/sync so the production D1 catalog stays the single
source of truth. The endpoint reconciles its category table to exactly the posted
list, so category changes need no Worker redeploy.

Options:
  --dry-run       Validate the payload and print the request body without sending it
  --root <path>   Repository root containing catalog/ (default: this repository)
  --help          Show this help

Environment:
  CATALOG_SYNC_URL     Sync endpoint (default: ${defaultSyncUrl})
  CATALOG_SYNC_TOKEN   Bearer token; required unless --dry-run`
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }
  const categories = await readCategories(options.root)
  const entries = await loadCatalogEntries(options.root, categoryIdSet(categories))
  const body = buildSyncBody(entries, categories)
  if (options.dryRun) {
    process.stdout.write(`${JSON.stringify(body, null, 2)}\n`)
    console.error(`Dry run: validated ${entries.length} entries and ${categories.length} categories; nothing was sent.`)
    return
  }
  const { url, token } = resolveSyncConfig(process.env)
  const result = await postCatalogSync({ url, token, body })
  const acknowledgedCategories = result.categories === undefined ? '' : `, categories=${result.categories}`
  console.log(`Synced ${entries.length} catalog entries and ${categories.length} categories to ${url}: total=${result.total ?? 'unknown'}${acknowledgedCategories}, removedSources=${result.removedSources ?? 'unknown'}`)
}

if (process.argv[1] !== undefined && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    await main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
