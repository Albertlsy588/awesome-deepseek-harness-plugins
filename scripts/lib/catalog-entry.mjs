import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

export const schemaReference = '../schema/plugin.schema.json'

export function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertExactKeys(value, allowed, label) {
  const actual = Object.keys(value).sort()
  const expected = [...allowed].sort()
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} must contain exactly: ${expected.join(', ')}`)
}

export function slugPart(value) {
  return value
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function pluginFileName(id) {
  const [owner, repository] = id.split('/')
  return `${slugPart(owner)}--${slugPart(repository)}.json`
}

export function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function validateCatalogEntry(entry, file, categoryIds) {
  const label = file
  assert(isObject(entry), `${label} must contain a JSON object`)
  assertExactKeys(entry, ['$schema', 'id', 'name', 'repository', 'category', 'description', 'added'], label)
  assert(entry.$schema === schemaReference, `${label} must reference ${schemaReference}`)
  assert(typeof entry.id === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(entry.id), `${label} has an invalid id`)
  assert(path.posix.basename(file) === pluginFileName(entry.id), `${label} should be named ${pluginFileName(entry.id)}`)
  assert(typeof entry.name === 'string' && entry.name.trim().length > 0 && entry.name.length <= 120, `${label} has an invalid name`)
  assert(entry.repository === `https://github.com/${entry.id}`, `${label}.repository must match its id exactly`)
  assert(categoryIds instanceof Set && categoryIds.has(entry.category), `${label} has an unknown category`)
  assert(isObject(entry.description), `${label}.description must be an object`)
  assertExactKeys(entry.description, ['en', 'zh'], `${label}.description`)
  for (const locale of ['en', 'zh']) {
    const description = entry.description[locale]
    assert(typeof description === 'string' && description.trim().length > 0 && description.length <= 1000, `${label} has an invalid ${locale} description`)
  }
  assert(typeof entry.added === 'string' && isIsoDate(entry.added), `${label} has an invalid added date`)
  return entry
}

export async function readCategories(root) {
  const categories = JSON.parse(await readFile(path.join(root, 'catalog/categories.json'), 'utf8'))
  assert(isObject(categories) && Array.isArray(categories.categories), 'catalog/categories.json must contain a categories array')
  return categories.categories
}

export function categoryIdSet(categories) {
  return new Set(categories.map(category => category?.id))
}

export async function loadCatalogEntries(root, categoryIds) {
  const directory = path.join(root, 'catalog/plugins')
  const files = (await readdir(directory)).filter(file => file.endsWith('.json')).sort()
  const entries = []
  for (const file of files) {
    const relative = path.posix.join('catalog/plugins', file)
    let entry
    try {
      entry = JSON.parse(await readFile(path.join(directory, file), 'utf8'))
    } catch (error) {
      throw new Error(`${relative} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
    }
    entries.push(validateCatalogEntry(entry, relative, categoryIds))
  }
  return entries
}
