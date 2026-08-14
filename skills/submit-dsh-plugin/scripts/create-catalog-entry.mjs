#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const allowedOptions = new Set([
  'catalog-root',
  'id',
  'name',
  'category',
  'description-en',
  'description-zh',
  'added',
])

function usage() {
  return `用法：
  node create-catalog-entry.mjs \\
    --catalog-root <path> \\
    --id <owner/repository> \\
    --category <category-id> \\
    --description-en <text> \\
    --description-zh <text> \\
    [--name <display-name>] \\
    [--added <YYYY-MM-DD>] \\
    [--dry-run]`
}

function fail(message) {
  throw new Error(message)
}

function parseArgs(argv) {
  const values = new Map()
  let dryRun = false
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--help' || argument === '-h') return { help: true, values, dryRun }
    if (argument === '--dry-run') {
      dryRun = true
      continue
    }
    if (!argument.startsWith('--')) fail(`意外参数：${argument}`)
    const key = argument.slice(2)
    if (!allowedOptions.has(key)) fail(`未知选项：--${key}`)
    if (values.has(key)) fail(`重复选项：--${key}`)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) fail(`--${key} 缺少参数值`)
    values.set(key, value)
    index += 1
  }
  return { help: false, values, dryRun }
}

function required(values, key) {
  const value = values.get(key)?.trim()
  if (!value) fail(`缺少必填选项：--${key}`)
  return value
}

function slugPart(value) {
  return value
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function pluginFileName(id) {
  const [owner, repository] = id.split('/')
  return `${slugPart(owner)}--${slugPart(repository)}.json`
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    fail(`无法读取 ${file}：${error instanceof Error ? error.message : String(error)}`)
  }
}

function validateDescription(value, locale) {
  const description = value.trim()
  if (description.length === 0 || description.length > 1000) {
    fail(`${locale}简介长度必须为 1–1000 个字符`)
  }
  return description
}

async function main() {
  const { help, values, dryRun } = parseArgs(process.argv.slice(2))
  if (help) {
    console.log(usage())
    return
  }

  const root = path.resolve(required(values, 'catalog-root'))
  const id = required(values, 'id')
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(id)) {
    fail('--id 必须使用 owner/repository 格式')
  }
  const [, repositoryName] = id.split('/')
  const name = (values.get('name') ?? repositoryName).trim()
  if (name.length === 0 || name.length > 120) fail('--name 长度必须为 1–120 个字符')

  const categoriesFile = path.join(root, 'catalog/categories.json')
  const pluginsDirectory = path.join(root, 'catalog/plugins')
  const categories = await readJson(categoriesFile)
  const categoryIds = new Set(categories?.categories?.map(category => category?.id))
  const category = required(values, 'category')
  if (!categoryIds.has(category)) {
    fail(`未知分类“${category}”。可用分类：${[...categoryIds].join(', ')}`)
  }

  const added = (values.get('added') ?? new Date().toISOString().slice(0, 10)).trim()
  if (!isIsoDate(added)) fail('--added 必须是 YYYY-MM-DD 格式的有效日期')

  const entry = {
    $schema: '../schema/plugin.schema.json',
    id,
    name,
    repository: `https://github.com/${id}`,
    category,
    description: {
      en: validateDescription(required(values, 'description-en'), '英文'),
      zh: validateDescription(required(values, 'description-zh'), '中文'),
    },
    added,
  }

  let existingFiles
  try {
    existingFiles = (await readdir(pluginsDirectory)).filter(file => file.endsWith('.json'))
  } catch (error) {
    fail(`无法读取 ${pluginsDirectory}：${error instanceof Error ? error.message : String(error)}`)
  }
  for (const file of existingFiles) {
    const existing = await readJson(path.join(pluginsDirectory, file))
    if (existing?.id?.toLocaleLowerCase('en-US') === id.toLocaleLowerCase('en-US')) {
      fail(`插件 ID 已存在于 catalog/plugins/${file}`)
    }
    if (existing?.repository?.toLocaleLowerCase('en-US') === entry.repository.toLocaleLowerCase('en-US')) {
      fail(`插件仓库已存在于 catalog/plugins/${file}`)
    }
  }

  const relativeTarget = path.posix.join('catalog/plugins', pluginFileName(id))
  const target = path.join(root, relativeTarget)
  const serialized = `${JSON.stringify(entry, null, 2)}\n`
  if (dryRun) {
    console.log(serialized.trimEnd())
    console.error(`试运行：将创建 ${relativeTarget}`)
    return
  }

  await mkdir(pluginsDirectory, { recursive: true })
  try {
    await writeFile(target, serialized, { flag: 'wx' })
  } catch (error) {
    if (error?.code === 'EEXIST') fail(`拒绝覆盖 ${relativeTarget}`)
    throw error
  }
  console.log(`已创建 ${relativeTarget}`)
}

main().catch(error => {
  console.error(`错误：${error instanceof Error ? error.message : String(error)}`)
  console.error(usage())
  process.exitCode = 1
})
