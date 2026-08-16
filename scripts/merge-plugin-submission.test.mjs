import assert from 'node:assert/strict'
import test from 'node:test'

import {
  mergeValidatedSubmission,
  runMergeFromEnvironment,
} from './merge-plugin-submission.mjs'

function pullRequest({
  state = 'open',
  merged = false,
  headSha = 'a'.repeat(40),
  baseRef = 'main',
} = {}) {
  return {
    state,
    merged,
    head: { sha: headSha },
    base: { ref: baseRef },
  }
}

test('merges the exact validated head with squash', async () => {
  const requests = []
  const client = {
    async request(apiPath, options) {
      requests.push({ apiPath, options })
      if (options === undefined) return pullRequest()
      return { merged: true, sha: 'merge-sha', message: 'Pull Request successfully merged' }
    },
  }

  const result = await mergeValidatedSubmission({
    repository: 'owner/catalog',
    pullNumber: '42',
    expectedHeadSha: 'a'.repeat(40),
    expectedBaseRef: 'main',
    client,
  })

  assert.deepEqual(result, { status: 'merged', sha: 'merge-sha' })
  assert.deepEqual(requests, [
    { apiPath: '/repos/owner/catalog/pulls/42', options: undefined },
    {
      apiPath: '/repos/owner/catalog/pulls/42/merge',
      options: {
        method: 'PUT',
        body: JSON.stringify({ sha: 'a'.repeat(40), merge_method: 'squash' }),
      },
    },
  ])
})

test('does not merge a stale workflow run', async () => {
  let merged = false
  const result = await mergeValidatedSubmission({
    repository: 'owner/catalog',
    pullNumber: '42',
    expectedHeadSha: 'a'.repeat(40),
    expectedBaseRef: 'main',
    client: {
      async request(_apiPath, options) {
        if (options !== undefined) merged = true
        return pullRequest({ headSha: 'b'.repeat(40) })
      },
    },
  })

  assert.deepEqual(result, { status: 'stale', currentHeadSha: 'b'.repeat(40) })
  assert.equal(merged, false)
})

test('does not merge a pull request targeting another branch', async () => {
  await assert.rejects(
    mergeValidatedSubmission({
      repository: 'owner/catalog',
      pullNumber: '42',
      expectedHeadSha: 'a'.repeat(40),
      expectedBaseRef: 'main',
      client: { async request() { return pullRequest({ baseRef: 'release' }) } },
    }),
    /targets release instead of main/,
  )
})

test('treats an already merged pull request as an idempotent success', async () => {
  const result = await mergeValidatedSubmission({
    repository: 'owner/catalog',
    pullNumber: '42',
    expectedHeadSha: 'a'.repeat(40),
    expectedBaseRef: 'main',
    client: { async request() { return pullRequest({ state: 'closed', merged: true }) } },
  })

  assert.deepEqual(result, { status: 'already-merged' })
})

test('reports a merge rejected by repository rules', async () => {
  await assert.rejects(
    mergeValidatedSubmission({
      repository: 'owner/catalog',
      pullNumber: '42',
      expectedHeadSha: 'a'.repeat(40),
      expectedBaseRef: 'main',
      client: {
        async request(_apiPath, options) {
          if (options === undefined) return pullRequest()
          return { merged: false, message: 'Required status check is expected.' }
        },
      },
    }),
    /Required status check is expected/,
  )
})

test('rejects invalid workflow inputs before calling GitHub', async () => {
  const valid = {
    repository: 'owner/catalog',
    pullNumber: '42',
    expectedHeadSha: 'a'.repeat(40),
    expectedBaseRef: 'main',
  }
  let requested = false
  const client = { async request() { requested = true } }

  for (const [override, message] of [
    [{ repository: 'invalid' }, /repository/],
    [{ pullNumber: '0' }, /pull request number/],
    [{ expectedHeadSha: 'short' }, /head SHA/],
    [{ expectedBaseRef: 'release' }, /must target main/],
  ]) {
    await assert.rejects(mergeValidatedSubmission({ ...valid, ...override, client }), message)
  }
  assert.equal(requested, false)
})

test('rejects a closed unmerged pull request', async () => {
  await assert.rejects(
    mergeValidatedSubmission({
      repository: 'owner/catalog',
      pullNumber: '42',
      expectedHeadSha: 'a'.repeat(40),
      expectedBaseRef: 'main',
      client: { async request() { return pullRequest({ state: 'closed' }) } },
    }),
    /is not open/,
  )
})

test('runs the merge from workflow environment values', async () => {
  const messages = []
  const result = await runMergeFromEnvironment({
    env: {
      PLUGIN_REVIEW_REPOSITORY: 'owner/catalog',
      PLUGIN_REVIEW_PULL_NUMBER: '42',
      PLUGIN_REVIEW_EXPECTED_HEAD_SHA: 'a'.repeat(40),
      PLUGIN_REVIEW_EXPECTED_BASE_REF: 'main',
    },
    client: {
      async request(_apiPath, options) {
        if (options === undefined) return pullRequest()
        return { merged: true, sha: 'merge-sha' }
      },
    },
    log: message => messages.push(message),
  })

  assert.deepEqual(result, { status: 'merged', sha: 'merge-sha' })
  assert.deepEqual(messages, ['MERGED owner/catalog#42 as merge-sha'])
})

test('logs and exits cleanly when the workflow head is stale', async () => {
  const messages = []
  const result = await runMergeFromEnvironment({
    env: {
      PLUGIN_REVIEW_REPOSITORY: 'owner/catalog',
      PLUGIN_REVIEW_PULL_NUMBER: '42',
      PLUGIN_REVIEW_EXPECTED_HEAD_SHA: 'a'.repeat(40),
      PLUGIN_REVIEW_EXPECTED_BASE_REF: 'main',
    },
    client: { async request() { return pullRequest({ headSha: 'b'.repeat(40) }) } },
    log: message => messages.push(message),
  })

  assert.deepEqual(result, { status: 'stale', currentHeadSha: 'b'.repeat(40) })
  assert.match(messages[0], /SKIP stale workflow head/)
})
