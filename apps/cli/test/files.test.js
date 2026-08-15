import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, rm, rmdir, unlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import { withFileLock } from '../src/files.js'

test('does not enter an old generation after its empty lock directory is replaced', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-1024store-lock-generation-'))
  const target = join(directory, 'state.json')
  let active = 0
  let maximumActive = 0
  let firstHook = true
  let resumeFirstOwner
  let reportFirstOwnerReady
  const firstOwnerReady = new Promise((resolve) => { reportFirstOwnerReady = resolve })
  const firstOwnerResume = new Promise((resolve) => { resumeFirstOwner = resolve })
  let releaseSecond
  let reportSecondEntered
  const secondEntered = new Promise((resolve) => { reportSecondEntered = resolve })
  const secondRelease = new Promise((resolve) => { releaseSecond = resolve })

  async function criticalSection(waitForRelease) {
    active += 1
    maximumActive = Math.max(maximumActive, active)
    try {
      if (waitForRelease) await waitForRelease
    } finally {
      active -= 1
    }
  }

  const first = withFileLock(target, () => criticalSection(), {
    async beforeOwnerCommit() {
      if (!firstHook) return
      firstHook = false
      reportFirstOwnerReady()
      await firstOwnerResume
    },
  })
  await firstOwnerReady

  const second = withFileLock(target, async () => {
    reportSecondEntered()
    await criticalSection(secondRelease)
  })
  await secondEntered
  resumeFirstOwner()
  await delay(100)
  assert.equal(active, 1)
  assert.equal(maximumActive, 1)
  releaseSecond()
  await Promise.all([first, second])
  assert.equal(maximumActive, 1)
})

test('does not reclaim a live owner when its metadata is temporarily unreadable', {
  skip: process.platform === 'win32' && 'Windows chmod does not remove read access',
}, async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-1024store-lock-owner-'))
  const target = join(directory, 'state.json')
  const lockDirectory = `${target}.lock`
  const ownerPath = join(lockDirectory, 'existing.owner')
  await mkdir(lockDirectory)
  await writeFile(ownerPath, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }))
  const staleTime = new Date(Date.now() - 10_000)
  await utimes(ownerPath, staleTime, staleTime)
  await chmod(ownerPath, 0o000)
  context.after(async () => {
    await chmod(ownerPath, 0o600).catch(() => {})
    await rm(directory, { recursive: true, force: true })
  })

  let entered = false
  const contender = withFileLock(target, () => { entered = true })
  await delay(100)
  assert.equal(entered, false)

  await chmod(ownerPath, 0o600)
  await unlink(ownerPath)
  await rmdir(lockDirectory)
  await contender
  assert.equal(entered, true)
})
