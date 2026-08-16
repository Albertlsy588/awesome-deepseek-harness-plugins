#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { lstat, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { assert, isObject, validateCatalogEntry } from './lib/catalog-entry.mjs'

const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = path.resolve(process.env.PLUGIN_REVIEW_ROOT ?? scriptRoot)
const catalogPrefix = 'catalog/plugins/'
const catalogFilePattern = /^catalog\/plugins\/[^/]+\.json$/
const reviewCommentMarker = '<!-- dsh-plugin-submission-review -->'

export { validateCatalogEntry }

function repositoryParts(id) {
  const parts = id.split('/')
  if (parts.length !== 2 || parts.some(part => !/^[A-Za-z0-9_.-]+$/.test(part))) {
    throw new Error(`Invalid plugin id: ${id}`)
  }
  return parts.map(encodeURIComponent)
}

function decodeBlob(blob, packagePath) {
  if (blob.encoding !== 'base64' || typeof blob.content !== 'string') {
    throw new Error(`${packagePath} could not be read as text`)
  }
  return Buffer.from(blob.content.replace(/\n/g, ''), 'base64').toString('utf8')
}

function resolvePatchPath(packagePath, patch) {
  if (path.posix.isAbsolute(patch) || patch.includes('\\')) {
    throw new Error(`${packagePath} has an invalid dsh.bundle.patch path: ${patch}`)
  }
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(packagePath), patch))
  if (resolved === '..' || resolved.startsWith('../')) {
    throw new Error(`${packagePath} has a dsh.bundle.patch path outside the repository: ${patch}`)
  }
  return resolved
}

export async function findHarnessBundle(tree, readBlob) {
  const files = new Map(tree.filter(item => item.type === 'blob').map(item => [item.path, item]))
  const packages = [...files.values()]
    .filter(item => item.path === 'package.json' || item.path.endsWith('/package.json'))
    .filter(item => !item.path.split('/').includes('node_modules'))
    .sort((left, right) => left.path.split('/').length - right.path.split('/').length || left.path.localeCompare(right.path))

  if (packages.length === 0) throw new Error('Repository contains no package.json')

  const invalidBundles = []
  for (const packageFile of packages) {
    let manifest
    try {
      manifest = JSON.parse(decodeBlob(await readBlob(packageFile.sha), packageFile.path))
    } catch (error) {
      invalidBundles.push(`${packageFile.path}: ${error instanceof Error ? error.message : String(error)}`)
      continue
    }

    const bundle = isObject(manifest) && isObject(manifest.dsh) && isObject(manifest.dsh.bundle)
      ? manifest.dsh.bundle
      : undefined
    if (bundle === undefined) continue
    if (typeof bundle.patch !== 'string' || bundle.patch.trim().length === 0) {
      invalidBundles.push(`${packageFile.path}: dsh.bundle.patch must be a non-empty string`)
      continue
    }

    try {
      const patchPath = resolvePatchPath(packageFile.path, bundle.patch.trim())
      if (!files.has(patchPath)) {
        invalidBundles.push(`${packageFile.path}: dsh.bundle.patch does not exist: ${patchPath}`)
        continue
      }
      return { packagePath: packageFile.path, patchPath }
    } catch (error) {
      invalidBundles.push(error instanceof Error ? error.message : String(error))
    }
  }

  if (invalidBundles.length > 0) throw new Error(invalidBundles.join('\n'))
  throw new Error('No package.json declares dsh.bundle.patch')
}

export function createGitHubClient(token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'dsh-1024store-plugin-review',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token === undefined || token.length === 0 ? {} : { Authorization: `Bearer ${token}` }),
  }

  async function request(apiPath, options = {}) {
    const response = await fetch(`https://api.github.com${apiPath}`, {
      ...options,
      headers: {
        ...headers,
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...options.headers,
      },
    })
    const detail = await response.text()
    if (!response.ok) {
      throw new Error(`GitHub API ${response.status} for ${apiPath}: ${detail.slice(0, 300)}`)
    }
    return detail.length === 0 ? undefined : JSON.parse(detail)
  }

  return { request }
}

function validatePullContext(repository, pullNumber) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) {
    throw new Error('Missing or invalid pull request repository')
  }
  if (!/^[1-9]\d*$/.test(pullNumber ?? '')) throw new Error('Missing or invalid pull request number')
}

export function reviewComment(status, message) {
  const diagnostic = message.slice(0, 6000).replaceAll('```', '` ` `')
  if (status === 'passed') {
    return `${reviewCommentMarker}\n## Plugin submission review passed\n\n${diagnostic}`
  }
  if (status === 'manual-review') {
    return `${reviewCommentMarker}\n## Plugin submission review passed — maintainer review required\n\n${diagnostic}\n\nThis pull request modifies or removes existing catalog entries, so it will not be merged automatically. A maintainer will review the change set and merge it manually.`
  }
  return `${reviewCommentMarker}\n## Plugin submission review failed\n\n\`\`\`text\n${diagnostic}\n\`\`\`\n\nPush a correction to this pull request. The review will run again automatically. Failed reviews never close the pull request.`
}

export async function upsertReviewComment(repository, pullNumber, client, body) {
  validatePullContext(repository, pullNumber)
  const comments = await client.request(`/repos/${repository}/issues/${pullNumber}/comments?per_page=100`)
  if (!Array.isArray(comments)) throw new Error('Pull request comments are unavailable')
  const existing = comments.find(comment => (
    comment?.user?.login === 'github-actions[bot]'
    && typeof comment?.body === 'string'
    && comment.body.includes(reviewCommentMarker)
  ))
  if (existing === undefined) {
    await client.request(`/repos/${repository}/issues/${pullNumber}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    })
    return
  }
  await client.request(`/repos/${repository}/issues/comments/${existing.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ body }),
  })
}

export async function pullRequestChanges(repository, pullNumber, client) {
  validatePullContext(repository, pullNumber)

  const files = await client.request(`/repos/${repository}/pulls/${pullNumber}/files?per_page=100`)
  if (!Array.isArray(files)) throw new Error('Pull request file list is unavailable')
  if (files.length === 100) {
    throw new Error('Plugin submission PRs may not contain 100 or more changed files')
  }

  const statuses = {
    added: 'A',
    modified: 'M',
    removed: 'D',
    renamed: 'R',
    copied: 'C',
  }
  return files.map(file => {
    const status = statuses[file?.status]
    if (status === undefined || typeof file?.filename !== 'string') {
      throw new Error('Pull request contains an unsupported file change')
    }
    if (status === 'R' || status === 'C') {
      if (typeof file.previous_filename !== 'string') throw new Error('Pull request contains an incomplete renamed path')
      return { status, oldPath: file.previous_filename, file: file.filename }
    }
    return { status, file: file.filename }
  })
}

export async function reviewRepository(entry, client) {
  if (!isObject(entry) || typeof entry.id !== 'string' || typeof entry.repository !== 'string') {
    throw new Error('Catalog entry must contain string id and repository fields')
  }
  if (entry.repository !== `https://github.com/${entry.id}`) {
    throw new Error(`repository must be https://github.com/${entry.id}`)
  }

  const [owner, repository] = repositoryParts(entry.id)
  const base = `/repos/${owner}/${repository}`
  const metadata = await client.request(base)
  if (typeof metadata.default_branch !== 'string' || metadata.default_branch.length === 0) {
    throw new Error('Repository has no default branch')
  }
  const commit = await client.request(`${base}/commits/${encodeURIComponent(metadata.default_branch)}`)
  const treeSha = commit?.commit?.tree?.sha
  if (typeof treeSha !== 'string') throw new Error('Default branch commit has no tree')
  const tree = await client.request(`${base}/git/trees/${treeSha}?recursive=1`)
  if (!Array.isArray(tree.tree)) throw new Error('Repository tree is unavailable')
  if (tree.truncated === true) throw new Error('Repository tree is too large to inspect completely')

  return findHarnessBundle(tree.tree, sha => client.request(`${base}/git/blobs/${sha}`))
}

export function parseNameStatus(output) {
  const fields = output.split('\0')
  if (fields.at(-1) === '') fields.pop()

  const changes = []
  for (let index = 0; index < fields.length;) {
    const status = fields[index++]
    if (status === undefined || status.length === 0) throw new Error('Git returned an invalid change status')
    if (status.startsWith('R') || status.startsWith('C')) {
      const oldPath = fields[index++]
      const file = fields[index++]
      if (oldPath === undefined || file === undefined) throw new Error('Git returned an incomplete renamed or copied path')
      changes.push({ status, oldPath, file })
    } else {
      const file = fields[index++]
      if (file === undefined) throw new Error('Git returned an incomplete changed path')
      changes.push({ status, file })
    }
  }
  return changes
}

function describeChange(change) {
  return change.oldPath === undefined
    ? `${change.status} ${change.file}`
    : `${change.status} ${change.oldPath} -> ${change.file}`
}

export function validateSubmissionChanges(changes) {
  if (changes.length === 0) {
    throw new Error(`Plugin submission PRs must change at least one ${catalogPrefix}*.json file`)
  }

  const problems = []
  const reviewables = []
  const deletions = []
  let additions = 0
  for (const change of changes) {
    // git reports rename/copy statuses with a similarity score (R100, C75).
    const status = change.status[0]
    const paths = change.oldPath === undefined ? [change.file] : [change.oldPath, change.file]
    if (!['A', 'M', 'D', 'R', 'C'].includes(status)) {
      problems.push(`unsupported change: ${describeChange(change)}`)
      continue
    }
    if (!paths.every(candidate => catalogFilePattern.test(candidate))) {
      problems.push(`unexpected change: ${describeChange(change)}`)
      continue
    }
    if (status === 'D') deletions.push(change.file)
    else reviewables.push(change.file)
    if (status === 'A') additions += 1
  }
  if (problems.length > 0) {
    throw new Error([
      `Plugin submission PRs may only add, modify, or delete ${catalogPrefix}*.json files.`,
      ...problems,
    ].join('\n'))
  }

  const verdict = changes.length === 1 && additions === 1 ? 'auto-merge' : 'manual-review'
  return { verdict, reviewables, deletions, changes }
}

export async function readCatalogEntry(rootDirectory, file) {
  const target = path.join(rootDirectory, file)
  const metadata = await lstat(target)
  assert(metadata.isFile(), `${file} must be a regular file`)
  return JSON.parse(await readFile(target, 'utf8'))
}

function changedFiles(base, head) {
  for (const [name, value] of [['base', base], ['head', head]]) {
    if (!/^[0-9a-f]{40}$/i.test(value ?? '')) throw new Error(`Missing or invalid ${name} commit SHA`)
  }
  const output = execFileSync('git', [
    'diff', '--name-status', '-z', base, head,
  ], { cwd: root, encoding: 'utf8' })
  return parseNameStatus(output)
}

function workflowError(file, message) {
  const escaped = message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
  process.stderr.write(`::error file=${file}::${escaped}\n`)
}

function publishVerdict(verdict) {
  console.log(`VERDICT ${verdict}`)
  const output = process.env.GITHUB_OUTPUT
  if (output === undefined || output.length === 0) return
  appendFileSync(output, `verdict=${verdict}\n`)
}

async function main() {
  const base = process.env.PLUGIN_REVIEW_BASE_SHA
  const head = process.env.PLUGIN_REVIEW_HEAD_SHA
  const client = createGitHubClient(process.env.GITHUB_TOKEN)
  const repository = process.env.PLUGIN_REVIEW_REPOSITORY
  const pullNumber = process.env.PLUGIN_REVIEW_PULL_NUMBER
  let file = catalogPrefix
  try {
    const changes = repository === undefined && pullNumber === undefined
      ? changedFiles(base, head)
      : await pullRequestChanges(repository, pullNumber, client)
    const submission = validateSubmissionChanges(changes)
    const categories = JSON.parse(await readFile(path.join(root, 'catalog/categories.json'), 'utf8'))
    const categoryIds = new Set(categories?.categories?.map(category => category?.id))
    for (const target of submission.reviewables) {
      file = target
      const entry = await readCatalogEntry(root, target)
      validateCatalogEntry(entry, target, categoryIds)
      const result = await reviewRepository(entry, client)
      console.log(`PASS ${entry.id}: ${result.packagePath} -> ${result.patchPath}`)
    }
    for (const target of submission.deletions) {
      console.log(`PASS delete ${target}`)
    }
    file = catalogPrefix
    publishVerdict(submission.verdict)
    if (repository !== undefined && pullNumber !== undefined) {
      const body = submission.verdict === 'auto-merge'
        ? reviewComment('passed', 'All static checks passed. The validated pull request will be squash-merged automatically.')
        : reviewComment('manual-review', [
          'All static checks passed for this change set:',
          '',
          ...submission.changes.map(change => `- ${describeChange(change)}`),
        ].join('\n'))
      await upsertReviewComment(repository, pullNumber, client, body)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    publishVerdict('rejected')
    workflowError(file, message)
    console.error(`FAIL ${file}\n${message}`)
    if (repository !== undefined && pullNumber !== undefined) {
      try {
        await upsertReviewComment(repository, pullNumber, client, reviewComment('failed', message))
      } catch (commentError) {
        console.error(`Unable to report the failure on the pull request: ${commentError instanceof Error ? commentError.message : String(commentError)}`)
      }
    }
    process.exitCode = 1
  }
}

if (process.argv[1] !== undefined && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main()
}
