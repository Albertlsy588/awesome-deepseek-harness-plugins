import assert from 'node:assert/strict'
import test from 'node:test'
import { parseArgs, parseRepository, UsageError } from '../src/args.js'

test('parses add commands, default profile, and refs', () => {
  assert.deepEqual(parseArgs(['add', 'Owner/Plugin']), {
    command: 'add',
    profile: 'web',
    passthroughArgs: [],
    pluginId: 'owner/plugin',
    requestedRef: null,
    source: 'github:Owner/Plugin',
  })
  assert.deepEqual(parseArgs(['add', 'github:Owner/Plugin.git#v1.2.0', '--profile=desktop']), {
    command: 'add',
    profile: 'desktop',
    passthroughArgs: [],
    pluginId: 'owner/plugin',
    requestedRef: 'v1.2.0',
    source: 'github:Owner/Plugin#v1.2.0',
  })
})

test('parses monorepo subdirectory plugin ids into pnpm path specs', () => {
  // The documented id form.
  assert.deepEqual(parseRepository('Owner/Monorepo/packages/foo'), {
    pluginId: 'owner/monorepo/packages/foo',
    requestedRef: null,
    source: 'github:Owner/Monorepo#path:packages/foo',
  })
  // The raw pnpm spec reports the same plugin id, so telemetry agrees.
  assert.deepEqual(parseRepository('github:Owner/Monorepo#path:packages/foo'), {
    pluginId: 'owner/monorepo/packages/foo',
    requestedRef: null,
    source: 'github:Owner/Monorepo#path:packages/foo',
  })
  // A pinned commit combines with the subdirectory.
  assert.deepEqual(parseRepository('Owner/Monorepo/packages/foo#v1.2.0'), {
    pluginId: 'owner/monorepo/packages/foo',
    requestedRef: 'v1.2.0',
    source: 'github:Owner/Monorepo#v1.2.0&path:packages/foo',
  })
  // Traversal and contradictory subdirectories are rejected.
  assert.throws(() => parseRepository('owner/monorepo/../secret'), UsageError)
  assert.throws(() => parseRepository('owner/monorepo/./foo'), UsageError)
  assert.throws(() => parseRepository('owner/monorepo/packages/foo#path:packages/bar'), UsageError)
})

test('rejects ambiguous repositories and unsafe profiles', () => {
  assert.throws(() => parseRepository('https://github.com/owner/plugin'), UsageError)
  assert.throws(() => parseArgs(['add', 'owner/plugin', '--profile', '../secret']), UsageError)
  assert.throws(() => parseArgs(['add', 'owner/plugin', '--profile', '_private']), UsageError)
  assert.throws(() => parseArgs(['add', 'owner/plugin', '--profile', '-web']), UsageError)
  assert.equal(parseArgs(['add', 'owner/plugin', '--profile', 'web.preview_1']).profile, 'web.preview_1')
  assert.deepEqual(parseArgs(['add', 'owner/plugin', 'owner/other']).passthroughArgs, ['owner/other'])
  assert.throws(() => parseArgs(['add', '--ignore-scripts', 'owner/plugin']), UsageError)
  assert.throws(() => parseRepository('owner/plugin#bad ref'), UsageError)
})

test('passes every non-wrapper argument unchanged and stops parsing after --', () => {
  const parsed = parseArgs([
    'add',
    'Owner/Plugin',
    '--ignore-scripts',
    '--config.confirmModulesPurge=false',
    'value;still-one-argument',
    '--profile',
    'desktop',
    '--',
    '--profile',
    '../belongs-to-official-cli',
    '--',
  ])

  assert.equal(parsed.profile, 'desktop')
  assert.deepEqual(parsed.passthroughArgs, [
    '--ignore-scripts',
    '--config.confirmModulesPurge=false',
    'value;still-one-argument',
    '--profile',
    '../belongs-to-official-cli',
    '--',
  ])
})

test('parses telemetry controls', () => {
  assert.deepEqual(parseArgs(['telemetry']), { command: 'telemetry', action: 'status' })
  assert.deepEqual(parseArgs(['telemetry', 'disable']), { command: 'telemetry', action: 'disable' })
  assert.throws(() => parseArgs(['telemetry', 'upload-everything']), UsageError)
})
