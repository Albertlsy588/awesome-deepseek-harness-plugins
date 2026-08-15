import assert from 'node:assert/strict'
import test from 'node:test'
import { parseArgs, parseRepository, UsageError } from '../cli/args.js'
import { SELF_PACKAGE_NAME, SELF_PLUGIN_ID } from '../cli/constants.js'

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

test('parses store as a normalized self-install add command', () => {
  assert.deepEqual(parseArgs(['store']), {
    command: 'add',
    profile: 'web',
    passthroughArgs: [],
    pluginId: SELF_PLUGIN_ID,
    requestedRef: null,
    source: SELF_PACKAGE_NAME,
    knownPackageNames: [SELF_PACKAGE_NAME],
  })
  assert.equal(parseArgs(['store', '-p', 'demo']).profile, 'demo')
  assert.equal(parseArgs(['store', '--profile=desktop']).profile, 'desktop')
  assert.deepEqual(parseArgs(['store', '--', '--ignore-scripts']).passthroughArgs, ['--ignore-scripts'])
})

test('store rejects positional arguments and unsafe profiles', () => {
  assert.throws(() => parseArgs(['store', 'extra']), UsageError)
  assert.throws(() => parseArgs(['store', '--ignore-scripts']), UsageError)
  assert.throws(() => parseArgs(['store', '--profile']), UsageError)
  assert.throws(() => parseArgs(['store', '--profile', '../secret']), UsageError)
})

test('parses telemetry controls', () => {
  assert.deepEqual(parseArgs(['telemetry']), { command: 'telemetry', action: 'status' })
  assert.deepEqual(parseArgs(['telemetry', 'disable']), { command: 'telemetry', action: 'disable' })
  assert.throws(() => parseArgs(['telemetry', 'upload-everything']), UsageError)
})
