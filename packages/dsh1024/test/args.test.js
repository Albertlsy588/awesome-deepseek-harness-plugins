import assert from 'node:assert/strict'
import test from 'node:test'
import { attributeTarget, parseArgs, scanPluginArgs, UsageError } from '../cli/args.js'
import { SELF_PACKAGE_NAME, SELF_PLUGIN_ID } from '../cli/constants.js'

test('forwards the official argument vector verbatim', () => {
  const argv = [
    'plugin',
    '--profile',
    'desktop',
    'add',
    'github:Owner/Plugin#v1.2.0',
    '--ignore-scripts',
    '--config.confirmModulesPurge=false',
    'value;still-one-argument',
    '--',
    '--profile',
    '../belongs-to-official-cli',
    '--',
  ]
  const parsed = parseArgs([...argv])

  assert.equal(parsed.command, 'plugin')
  assert.deepEqual(parsed.officialArgs, argv)
  assert.equal(parsed.profile, 'desktop')
  assert.equal(parsed.target, 'github:Owner/Plugin#v1.2.0')
  assert.deepEqual(parsed.attribution, {
    pluginId: 'owner/plugin',
    requestedRef: 'v1.2.0',
    knownPackageNames: [],
  })
})

test('never injects a default profile into the forwarded arguments', () => {
  const parsed = parseArgs(['plugin', 'add', 'github:owner/plugin'])
  assert.deepEqual(parsed.officialArgs, ['plugin', 'add', 'github:owner/plugin'])
  assert.equal(parsed.profile, null)
})

test('reads the profile from every official spelling and ignores the rest', () => {
  assert.equal(scanPluginArgs(['plugin', '--profile', 'web', 'add', 'owner/plugin']).profile, 'web')
  assert.equal(scanPluginArgs(['plugin', '--profile=desktop', 'add', 'owner/plugin']).profile, 'desktop')
  assert.equal(scanPluginArgs(['plugin', '-p', 'demo', 'add', 'owner/plugin']).profile, 'demo')
  // Arguments after the official separator belong to a deeper tool.
  assert.equal(scanPluginArgs(['plugin', 'add', 'owner/plugin', '--', '--profile', 'other']).profile, null)
  assert.equal(scanPluginArgs(['plugin', 'remove', 'owner/plugin']).target, null)
})

test('attributes catalog targets and the store package itself', () => {
  assert.deepEqual(attributeTarget('github:Owner/Plugin'), {
    pluginId: 'owner/plugin',
    requestedRef: null,
    knownPackageNames: [],
  })
  assert.deepEqual(attributeTarget('Owner/Plugin.git#v1.2.0'), {
    pluginId: 'owner/plugin',
    requestedRef: 'v1.2.0',
    knownPackageNames: [],
  })
  assert.deepEqual(attributeTarget(SELF_PACKAGE_NAME), {
    pluginId: SELF_PLUGIN_ID,
    requestedRef: null,
    knownPackageNames: [SELF_PACKAGE_NAME],
  })
})

test('never attributes a location target, so no path can reach an event', () => {
  for (const target of [
    './local/plugin',
    '../local/plugin',
    '/absolute/path/plugin',
    '~/plugins/mine',
    'C:\\Users\\someone\\plugin',
    'file:../local/plugin',
    'link:./local/plugin',
    'portal:./local/plugin',
    'https://github.com/owner/plugin',
    'git+ssh://git@github.com/owner/plugin.git',
    'github:./local/plugin',
  ]) {
    assert.equal(attributeTarget(target), null, target)
  }
})

test('leaves unrecognised targets unattributed instead of guessing', () => {
  // Published package names other than this CLI's own package are forwarded and
  // installed normally, but are not counted until their catalog mapping exists.
  assert.equal(attributeTarget('@opendsh/dsh-plugin-setting-mcp'), null)
  assert.equal(attributeTarget('some-plugin'), null)
  assert.equal(attributeTarget('owner/plugin/extra'), null)
  assert.equal(attributeTarget('owner/plugin#bad ref'), null)
})

test('rejects commands the wrapper does not own', () => {
  assert.throws(() => parseArgs(['add', 'owner/plugin']), UsageError)
  assert.throws(() => parseArgs(['store']), UsageError)
  assert.throws(() => parseArgs(['install', 'owner/plugin']), UsageError)
})

test('parses telemetry controls', () => {
  assert.deepEqual(parseArgs(['telemetry']), { command: 'telemetry', action: 'status' })
  assert.deepEqual(parseArgs(['telemetry', 'disable']), { command: 'telemetry', action: 'disable' })
  assert.throws(() => parseArgs(['telemetry', 'upload-everything']), UsageError)
})
