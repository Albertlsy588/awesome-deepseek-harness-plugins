import assert from 'node:assert/strict'
import test from 'node:test'
import { inspectInstallation } from '../src/profile.js'

const emptyState = {
  exists: false,
  dependencies: {},
  bundles: [],
  installedVersions: {},
}

test('verifies a newly installed GitHub dependency and resolves its version', () => {
  const after = {
    exists: true,
    dependencies: { '@example/plugin': 'github:Owner/Repo#v1' },
    bundles: ['@example/plugin'],
    installedVersions: { '@example/plugin': '1.2.3' },
  }
  assert.deepEqual(inspectInstallation(emptyState, after, 'owner/repo'), {
    beforePresent: false,
    afterPresent: true,
    packageNames: ['@example/plugin'],
    beforeVersion: null,
    afterVersion: '1.2.3',
  })
})

test('uses a local receipt to verify normalized dependency specs', () => {
  const before = {
    exists: true,
    dependencies: { plugin: 'git+ssh://git@host.invalid/resolved' },
    bundles: ['plugin'],
    installedVersions: { plugin: '2.0.0' },
  }
  const receipt = { packageNames: ['plugin'] }
  const result = inspectInstallation(before, before, 'owner/repo', receipt)
  assert.equal(result.beforePresent, true)
  assert.equal(result.afterPresent, true)
  assert.deepEqual(result.packageNames, ['plugin'])
})

test('does not accept an exit-zero command without observable profile state', () => {
  assert.equal(inspectInstallation(emptyState, emptyState, 'owner/repo').afterPresent, false)
})

test('bounds uploaded before and after versions to the API limit', () => {
  const longVersion = `1.0.0-${'x'.repeat(180)}`
  const state = {
    exists: true,
    dependencies: { plugin: `github:owner/repo#${'branch'.repeat(40)}` },
    bundles: ['plugin'],
    installedVersions: { plugin: longVersion },
  }
  const result = inspectInstallation(state, state, 'owner/repo')
  assert.equal(result.beforeVersion.length, 128)
  assert.equal(result.afterVersion.length, 128)
  assert.equal(result.afterVersion, longVersion.slice(0, 128))
})
