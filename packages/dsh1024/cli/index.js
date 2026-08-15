import { CLI_VERSION } from './constants.js'
import { parseArgs, UsageError } from './args.js'
import { resolveDshHome, storePaths } from './files.js'
import { addPlugin } from './add.js'
import {
  effectiveTelemetryEnabled,
  environmentDisablesTelemetry,
  loadTelemetryConfig,
  resetTelemetry,
  setTelemetryEnabled,
} from './telemetry.js'

const HELP = `dsh1024 ${CLI_VERSION}

Usage:
  dsh1024 add <owner/repository> [--profile <name>] [official arguments...]
  dsh1024 store [--profile <name>]  Install the 1024 Store plugin into DeepSeek Harness
  dsh1024 telemetry [status|enable|disable|reset]

Examples:
  dsh1024 add omdsh-dev/dsh-deep-research
  dsh1024 add owner/plugin#v1.2.0 --profile web
  dsh1024 add owner/plugin --profile web -- --ignore-scripts --reporter append-only

The add command delegates to the official @deepseek-ai/dsh CLI, verifies the
resulting profile, and records a narrow anonymous install event. Only the
repository, --profile, and the first -- separator are consumed; every other
argument is passed unchanged to the official CLI. Pass-through arguments are
never included in telemetry.`

function defaultIo() {
  return {
    stdout: (message) => process.stdout.write(`${message}\n`),
    stderr: (message) => process.stderr.write(`${message}\n`),
  }
}

export async function main(argv, overrides = {}) {
  const env = overrides.env ?? process.env
  const io = overrides.io ?? defaultIo()
  const dshHome = overrides.dshHome ?? resolveDshHome(env)
  let command

  try {
    command = parseArgs(argv)
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr(`Error: ${error.message}`)
      io.stderr('Run `dsh1024 --help` for usage.')
      return 2
    }
    throw error
  }

  if (command.command === 'help') {
    io.stdout(HELP)
    return 0
  }
  if (command.command === 'version') {
    io.stdout(CLI_VERSION)
    return 0
  }
  if (command.command === 'telemetry') {
    return telemetryCommand(command.action, { ...overrides, dshHome, env, io })
  }

  return addPlugin(command, {
    ...overrides,
    dshHome,
    env,
    stdout: io.stdout,
    stderr: io.stderr,
  })
}

async function telemetryCommand(action, context) {
  const { dshHome, env, io } = context
  if (action === 'status') {
    const config = await loadTelemetryConfig(dshHome)
    const configured = config?.enabled === false ? 'disabled' : 'enabled'
    const effective = effectiveTelemetryEnabled(config, env) ? 'enabled' : 'disabled'
    const override = environmentDisablesTelemetry(env) ? ' (environment override active)' : ''
    io.stdout(`Telemetry configured: ${configured}; effective: ${effective}${override}.`)
    io.stdout(`Pending events: ${await pendingCount(dshHome)}.`)
    return 0
  }
  if (action === 'reset') {
    await resetTelemetry(dshHome, context)
    io.stdout('Telemetry identity was rotated and pending events were cleared. The enabled or disabled preference was preserved.')
    return 0
  }

  const enabled = action === 'enable'
  await setTelemetryEnabled(dshHome, enabled, context)
  if (enabled && environmentDisablesTelemetry(env)) {
    io.stdout('Telemetry is configured as enabled, but an environment override still disables it.')
  } else {
    io.stdout(`Telemetry ${enabled ? 'enabled' : 'disabled'}.`)
  }
  return 0
}

async function pendingCount(dshHome) {
  try {
    const { readFile } = await import('node:fs/promises')
    const document = JSON.parse(await readFile(storePaths(dshHome).pending, 'utf8'))
    return Array.isArray(document?.events) ? document.events.length : 0
  } catch {
    return 0
  }
}

export { parseArgs, parseRepository, UsageError } from './args.js'
export { inspectInstallation, readProfileState } from './profile.js'
export {
  detectArch,
  detectCi,
  detectPlatform,
  enqueueEvent,
  flushPending,
} from './telemetry.js'
