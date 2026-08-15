import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { main } from '../cli/index.js'
import { EVENT_KEYS } from '../cli/constants.js'

function clock(start = '2026-08-15T01:00:00.000Z') {
  let value = new Date(start).getTime()
  return () => {
    const result = new Date(value)
    value += 1000
    return result
  }
}

function uuidSequence(...values) {
  let index = 0
  return () => values[index++] ?? `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
}

function ioCapture() {
  const stdout = []
  const stderr = []
  return {
    io: { stdout: (value) => stdout.push(value), stderr: (value) => stderr.push(value) },
    stdout,
    stderr,
  }
}

function installProfile(dshHome, profile = 'web', version = '1.2.3') {
  const directory = join(dshHome, 'profiles', profile)
  const moduleDirectory = join(directory, 'node_modules', '@demo', 'plugin')
  mkdirSync(moduleDirectory, { recursive: true })
  writeFileSync(join(directory, 'package.json'), JSON.stringify({
    dependencies: { '@demo/plugin': 'github:owner/repo#v1.2.3' },
    dsh: { profile: { bundles: ['@demo/plugin'] } },
  }))
  writeFileSync(join(moduleDirectory, 'package.json'), JSON.stringify({ name: '@demo/plugin', version }))
}

async function makeHome() {
  return mkdtemp(join(tmpdir(), 'dsh-1024store-cli-'))
}

test('delegates without a shell, verifies state, receipts locally, and posts the strict event schema', async () => {
  const dshHome = await makeHome()
  const output = ioCapture()
  const requests = []
  let invocation
  const exitCode = await main([
    'add',
    'Owner/Repo#v1.2.3',
    '--profile',
    'web',
    '--ignore-scripts',
    '--',
    '--reporter',
    'append-only',
    'value;still-one-argument',
  ], {
    dshHome,
    arch: 'x64',
    env: {
      DSH_1024STORE_DSH_PACKAGE: '@deepseek-ai/dsh@0.1.0-rc.5',
      DSH_1024STORE_TELEMETRY_URL: 'http://telemetry.invalid/api/v1/install-events',
      CI: '1',
    },
    io: output.io,
    platform: 'linux',
    now: clock(),
    uuid: uuidSequence(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ),
    spawn(command, args, options) {
      invocation = { command, args, options }
      installProfile(dshHome)
      return { status: 0 }
    },
    async fetchImpl(url, options) {
      requests.push({ url, options })
      return { ok: true, status: 202 }
    },
  })

  assert.equal(exitCode, 0)
  assert.equal(invocation.command, 'npx')
  assert.deepEqual(invocation.args, [
    '--yes',
    '@deepseek-ai/dsh@0.1.0-rc.5',
    'plugin',
    '--profile',
    'web',
    'add',
    'github:Owner/Repo#v1.2.3',
    '--ignore-scripts',
    '--reporter',
    'append-only',
    'value;still-one-argument',
  ])
  assert.equal(invocation.options.shell, false)
  assert.equal(requests.length, 1)

  const event = JSON.parse(requests[0].options.body)
  assert.deepEqual(Object.keys(event), EVENT_KEYS)
  assert.equal(event.clientId, '11111111-1111-4111-8111-111111111111')
  assert.equal(event.eventId, '22222222-2222-4222-8222-222222222222')
  assert.equal(event.pluginId, 'owner/repo')
  assert.equal(event.operation, 'install')
  assert.equal(event.status, 'success')
  assert.equal(event.afterVersion, '1.2.3')
  assert.equal(event.requestedRef, 'v1.2.3')
  assert.equal(event.dshVersion, '0.1.0-rc.5')
  assert.equal(event.sourceChannel, 'dsh-1024store-cli')
  assert.equal(event.isCi, true)
  assert.equal(requests[0].options.headers['user-agent'], '@dsh-1024store/cli')
  assert.equal('packageNames' in event, false)
  assert.equal(requests[0].options.body.includes('--ignore-scripts'), false)
  assert.equal(requests[0].options.body.includes('append-only'), false)
  assert.equal(requests[0].options.body.includes('value;still-one-argument'), false)

  const receipt = JSON.parse(await readFile(join(dshHome, '.dsh-1024store', 'receipts.json'), 'utf8'))
  const installed = Object.values(receipt.plugins)[0]
  assert.deepEqual(installed.packageNames, ['@demo/plugin'])
  assert.equal(installed.packages['@demo/plugin'].version, '1.2.3')
  assert.match(output.stderr[0], /records anonymous plugin install outcomes/)
})

test('uses the npm JavaScript entrypoint on Windows and preserves argument boundaries', async () => {
  const dshHome = await makeHome()
  const nodeExecutable = 'C:\\Program Files\\nodejs\\node.exe'
  const npmExecPath = 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js'
  let invocation
  const exitCode = await main([
    'add',
    'owner/repo',
    '--',
    '--',
    'value&still-one-argument',
    '%PATH%',
  ], {
    dshHome,
    env: { DO_NOT_TRACK: '1', npm_execpath: npmExecPath },
    execPath: nodeExecutable,
    platform: 'win32',
    io: ioCapture().io,
    spawn(command, args, options) {
      invocation = { command, args, options }
      installProfile(dshHome)
      return { status: 0 }
    },
  })

  assert.equal(exitCode, 0)
  assert.equal(invocation.command, nodeExecutable)
  assert.deepEqual(invocation.args, [
    npmExecPath,
    'exec',
    '--yes',
    '--',
    '@deepseek-ai/dsh',
    'plugin',
    '--profile',
    'web',
    'add',
    'github:owner/repo',
    '--',
    'value&still-one-argument',
    '%PATH%',
  ])
  assert.equal(invocation.options.shell, false)
})

test('bounds the reported DSH version to the Worker contract', async () => {
  const dshHome = await makeHome()
  const events = []
  const longVersion = `v${'1'.repeat(99)}`
  const exitCode = await main(['add', 'owner/repo'], {
    dshHome,
    env: { DSH_1024STORE_DSH_VERSION: longVersion },
    io: ioCapture().io,
    now: clock(),
    uuid: uuidSequence(
      '12121212-1212-4121-8121-121212121212',
      '34343434-3434-4343-8343-343434343434',
    ),
    spawn() {
      installProfile(dshHome)
      return { status: 0 }
    },
    async fetchImpl(_url, options) {
      events.push(JSON.parse(options.body))
      return { ok: true, status: 202 }
    },
  })

  assert.equal(exitCode, 0)
  assert.equal(events[0].dshVersion, longVersion.slice(0, 64))
})

test('reports reinstall when the plugin already exists', async () => {
  const dshHome = await makeHome()
  installProfile(dshHome)
  const events = []
  const exitCode = await main(['add', 'owner/repo'], {
    dshHome,
    env: {},
    io: ioCapture().io,
    now: clock(),
    uuid: uuidSequence(
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
    ),
    spawn() { return { status: 0 } },
    async fetchImpl(_url, options) {
      events.push(JSON.parse(options.body))
      return { ok: true }
    },
  })
  assert.equal(exitCode, 0)
  assert.equal(events[0].operation, 'reinstall')
})

test('DO_NOT_TRACK disables identity creation, queueing, and upload', async () => {
  const dshHome = await makeHome()
  let fetchCalls = 0
  const exitCode = await main(['add', 'owner/repo'], {
    dshHome,
    env: { DO_NOT_TRACK: '1' },
    io: ioCapture().io,
    spawn() {
      installProfile(dshHome)
      return { status: 0 }
    },
    async fetchImpl() {
      fetchCalls += 1
      throw new Error('must not upload')
    },
  })
  assert.equal(exitCode, 0)
  assert.equal(fetchCalls, 0)
  assert.equal(existsSync(join(dshHome, '.dsh-1024store', 'client.json')), false)
  assert.equal(existsSync(join(dshHome, '.dsh-1024store', 'pending.json')), false)
  assert.equal(existsSync(join(dshHome, '.dsh-1024store', 'receipts.json')), true)
})

test('keeps failed uploads and retries them before the next current event', async () => {
  const dshHome = await makeHome()
  const firstOutput = ioCapture()
  await main(['add', 'owner/repo'], {
    dshHome,
    env: {},
    io: firstOutput.io,
    now: clock(),
    uuid: uuidSequence(
      '55555555-5555-4555-8555-555555555555',
      '66666666-6666-4666-8666-666666666666',
    ),
    spawn() {
      installProfile(dshHome)
      return { status: 0 }
    },
    async fetchImpl() { throw new Error('offline') },
  })
  let pending = JSON.parse(readFileSync(join(dshHome, '.dsh-1024store', 'pending.json'), 'utf8'))
  assert.equal(pending.events.length, 1)
  assert.match(firstOutput.stderr.at(-1), /queued locally/)

  const delivered = []
  await main(['add', 'owner/repo'], {
    dshHome,
    env: {},
    io: ioCapture().io,
    now: clock('2026-08-15T02:00:00.000Z'),
    uuid: uuidSequence('77777777-7777-4777-8777-777777777777'),
    spawn() { return { status: 0 } },
    async fetchImpl(_url, options) {
      delivered.push(JSON.parse(options.body))
      return { ok: true }
    },
  })
  assert.deepEqual(delivered.map((event) => event.eventId), [
    '66666666-6666-4666-8666-666666666666',
    '77777777-7777-4777-8777-777777777777',
  ])
  pending = JSON.parse(readFileSync(join(dshHome, '.dsh-1024store', 'pending.json'), 'utf8'))
  assert.deepEqual(pending.events, [])
})

test('preserves official exit code and emits a narrow failed event', async () => {
  const dshHome = await makeHome()
  const events = []
  const exitCode = await main(['add', 'owner/repo'], {
    dshHome,
    env: {},
    io: ioCapture().io,
    now: clock(),
    uuid: uuidSequence(
      '88888888-8888-4888-8888-888888888888',
      '99999999-9999-4999-8999-999999999999',
    ),
    spawn() { return { status: 7 } },
    async fetchImpl(_url, options) {
      events.push(JSON.parse(options.body))
      return { ok: true }
    },
  })
  assert.equal(exitCode, 7)
  assert.equal(events[0].status, 'failed')
  assert.equal(events[0].errorCode, 'OFFICIAL_CLI_FAILED')
  assert.equal(JSON.stringify(events[0]).includes('stderr'), false)
  assert.equal(JSON.stringify(events[0]).includes(dshHome), false)
})

test('reports spawn errors without exposing the error message', async () => {
  const dshHome = await makeHome()
  const events = []
  const exitCode = await main(['add', 'owner/repo'], {
    dshHome,
    env: {},
    io: ioCapture().io,
    now: clock(),
    uuid: uuidSequence(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    ),
    spawn() { return { status: null, error: new Error('sensitive local spawn detail') } },
    async fetchImpl(_url, options) {
      events.push(JSON.parse(options.body))
      return { ok: true }
    },
  })
  assert.equal(exitCode, 1)
  assert.equal(events[0].errorCode, 'SPAWN_FAILED')
  assert.equal(JSON.stringify(events[0]).includes('sensitive'), false)
})

test('turns an unverifiable exit-zero result into a wrapper failure', async () => {
  const dshHome = await makeHome()
  const events = []
  const output = ioCapture()
  const exitCode = await main(['add', 'owner/repo'], {
    dshHome,
    env: {},
    io: output.io,
    now: clock(),
    uuid: uuidSequence(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ),
    spawn() { return { status: 0 } },
    async fetchImpl(_url, options) {
      events.push(JSON.parse(options.body))
      return { ok: true }
    },
  })
  assert.equal(exitCode, 1)
  assert.equal(events[0].errorCode, 'PROFILE_NOT_UPDATED')
  assert.match(output.stderr.join('\n'), /could not verify/)
})

test('telemetry controls persist status and reset identity plus queue', async () => {
  const dshHome = await makeHome()
  const storeDirectory = join(dshHome, '.dsh-1024store')
  mkdirSync(storeDirectory, { recursive: true })
  writeFileSync(join(storeDirectory, 'pending.json'), JSON.stringify({ schemaVersion: 1, events: [{}] }))
  const disabled = ioCapture()
  assert.equal(await main(['telemetry', 'disable'], {
    dshHome,
    env: {},
    io: disabled.io,
    now: clock(),
    uuid: uuidSequence('cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  }), 0)
  assert.match(disabled.stdout[0], /disabled/)
  assert.equal(existsSync(join(storeDirectory, 'pending.json')), false)
  const originalConfig = JSON.parse(readFileSync(join(storeDirectory, 'client.json'), 'utf8'))
  assert.equal(originalConfig.enabled, false)

  const status = ioCapture()
  await main(['telemetry', 'status'], { dshHome, env: { DO_NOT_TRACK: '1' }, io: status.io })
  assert.match(status.stdout[0], /effective: disabled \(environment override active\)/)

  writeFileSync(join(storeDirectory, 'pending.json'), JSON.stringify({ schemaVersion: 1, events: [{}] }))
  const reset = ioCapture()
  await main(['telemetry', 'reset'], {
    dshHome,
    env: {},
    io: reset.io,
    now: clock(),
    uuid: uuidSequence('dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  })
  const rotatedConfig = JSON.parse(readFileSync(join(storeDirectory, 'client.json'), 'utf8'))
  assert.equal(rotatedConfig.clientId, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd')
  assert.notEqual(rotatedConfig.clientId, originalConfig.clientId)
  assert.equal(rotatedConfig.enabled, false)
  assert.equal(existsSync(join(storeDirectory, 'pending.json')), false)
  assert.match(reset.stdout[0], /preference was preserved/)
})
