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
    --id <owner/repository[/sub/dir]> \\
    --category <category-id> \\
    --description-en <text> \\
    --description-zh <text> \\
    [--name <display-name>] \\
    [--added <YYYY-MM-DD>] \\
    [--dry-run]

monorepo 子包在 --id 中追加仓库内路径段（例如 owner/repository/packages/foo），
安装规格由目录推导为 github:owner/repository#path:sub/dir。`
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

// 文件名覆盖完整 ID：每个 `/` 分隔的段转小写并把连续非字母数字字符替换成
// `-`，再用 `--` 连接（与目录仓库 scripts/lib/catalog-entry.mjs 的
// pluginFileName 保持一致），因此同一仓库的不同子目录条目得到不同文件名。
function pluginFileName(id) {
  return `${id.split('/').map(slugPart).join('--')}.json`
}

// 插件 ID 为 owner/repository，可追加仓库内路径段（monorepo 子包）。路径段
// 会进入 pnpm 的 `github:owner/repository#path:` 安装规格，因此 `.` 与 `..`
// 段一律拒绝；201 字符上限与目录仓库的可信审查保持一致。
const idSegmentPattern = /^[A-Za-z0-9_.-]+$/

function isValidPluginId(id) {
  if (id.length > 201) return false
  const segments = id.split('/')
  return segments.length >= 2
    && segments.every(segment => idSegmentPattern.test(segment) && segment !== '.' && segment !== '..')
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
  if (!isValidPluginId(id)) {
    fail('--id 必须使用 owner/repository[/sub/dir] 格式（各段仅限 A-Za-z0-9_.-，路径段不能是 . 或 ..，总长不超过 201 字符）')
  }
  const idSegments = id.split('/')
  const [owner, repositoryName] = idSegments
  // 默认展示名称取 ID 的最后一段：两段 ID 即仓库名，子目录 ID 即子包目录名。
  const name = (values.get('name') ?? idSegments.at(-1)).trim()
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
    // repository 始终是由 ID 前两段推导的仓库根 URL；子目录路径只存在于 id 中。
    repository: `https://github.com/${owner}/${repositoryName}`,
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
  // 唯一性按完整 ID（不区分大小写）判断：同一仓库允许以不同子目录路径
  // 出现在多个条目中，因此不做仓库级别的重复拦截。
  for (const file of existingFiles) {
    const existing = await readJson(path.join(pluginsDirectory, file))
    if (existing?.id?.toLocaleLowerCase('en-US') === id.toLocaleLowerCase('en-US')) {
      fail(`插件 ID 已存在于 catalog/plugins/${file}`)
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
