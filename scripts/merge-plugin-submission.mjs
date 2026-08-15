#!/usr/bin/env node

import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { createGitHubClient } from './review-plugin-submission.mjs'

function validateInputs(repository, pullNumber, expectedHeadSha, expectedBaseRef) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) {
    throw new Error('Missing or invalid pull request repository')
  }
  if (!/^[1-9]\d*$/.test(pullNumber ?? '')) throw new Error('Missing or invalid pull request number')
  if (!/^[0-9a-f]{40}$/i.test(expectedHeadSha ?? '')) throw new Error('Missing or invalid expected head SHA')
  if (expectedBaseRef !== 'main') throw new Error('Automatic plugin merges must target main')
}

export async function mergeValidatedSubmission({
  repository,
  pullNumber,
  expectedHeadSha,
  expectedBaseRef,
  client,
}) {
  validateInputs(repository, pullNumber, expectedHeadSha, expectedBaseRef)
  const apiPath = `/repos/${repository}/pulls/${pullNumber}`
  const pull = await client.request(apiPath)

  if (pull?.merged === true) return { status: 'already-merged' }
  if (pull?.state !== 'open') throw new Error(`Pull request #${pullNumber} is not open`)
  if (pull?.base?.ref !== expectedBaseRef) {
    throw new Error(`Pull request #${pullNumber} targets ${pull?.base?.ref ?? 'an unknown branch'} instead of ${expectedBaseRef}`)
  }
  if (pull?.head?.sha !== expectedHeadSha) {
    return { status: 'stale', currentHeadSha: pull?.head?.sha }
  }

  const result = await client.request(`${apiPath}/merge`, {
    method: 'PUT',
    body: JSON.stringify({ sha: expectedHeadSha, merge_method: 'squash' }),
  })
  if (result?.merged !== true) {
    throw new Error(`GitHub refused to merge pull request #${pullNumber}: ${result?.message ?? 'unknown reason'}`)
  }
  return { status: 'merged', sha: result.sha }
}

export async function runMergeFromEnvironment({ env, client, log = console.log }) {
  const repository = env.PLUGIN_REVIEW_REPOSITORY
  const pullNumber = env.PLUGIN_REVIEW_PULL_NUMBER
  const expectedHeadSha = env.PLUGIN_REVIEW_EXPECTED_HEAD_SHA
  const expectedBaseRef = env.PLUGIN_REVIEW_EXPECTED_BASE_REF
  const result = await mergeValidatedSubmission({
    repository,
    pullNumber,
    expectedHeadSha,
    expectedBaseRef,
    client,
  })

  if (result.status === 'stale') {
    log(`SKIP stale workflow head ${expectedHeadSha}; current head is ${result.currentHeadSha}`)
    return result
  }
  log(`${result.status === 'merged' ? 'MERGED' : 'SKIP'} ${repository}#${pullNumber}${result.sha === undefined ? '' : ` as ${result.sha}`}`)
  return result
}

async function main() {
  await runMergeFromEnvironment({
    env: process.env,
    client: createGitHubClient(process.env.GITHUB_TOKEN),
  })
}

if (process.argv[1] !== undefined && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
