import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { win32 as win32Path } from 'node:path'
import { arch as hostArch, execPath as hostExecPath, platform as hostPlatform } from 'node:process'
import { CLI_VERSION, DEFAULT_DSH_PACKAGE, readCliEnv } from './constants.js'
import { readProfileState, inspectInstallation, createReceipt } from './profile.js'
import { getReceipt, readReceipts, saveReceipt } from './receipts.js'
import {
  detectArch,
  detectCi,
  detectPlatform,
  effectiveTelemetryEnabled,
  enqueueEvent,
  ensureTelemetryConfig,
  environmentDisablesTelemetry,
  flushPending,
  loadTelemetryConfig,
  markNoticeShown,
} from '../lib/shared/telemetry.js'

function officialDshVersion(packageSpec, env) {
  const explicitVersion = readCliEnv(env, 'DSH_VERSION')
  if (explicitVersion) return explicitVersion.slice(0, 64)
  const separator = packageSpec.lastIndexOf('@')
  const slash = packageSpec.lastIndexOf('/')
  return separator > slash ? packageSpec.slice(separator + 1, separator + 65) : null
}

function windowsNpmCli(env, nodeExecutable) {
  if (typeof env.npm_execpath === 'string' && /[\\/]npm-cli\.(?:c?js|mjs)$/i.test(env.npm_execpath)) {
    return env.npm_execpath
  }
  return win32Path.join(
    win32Path.dirname(nodeExecutable),
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js',
  )
}

function officialCliInvocation(officialPackage, command, context) {
  const officialArgs = [
    officialPackage,
    'plugin',
    '--profile',
    command.profile,
    'add',
    command.source,
    ...command.passthroughArgs,
  ]
  if (context.platformName !== 'win32') {
    return { executable: 'npx', args: ['--yes', ...officialArgs] }
  }

  return {
    executable: context.nodeExecutable,
    args: [
      windowsNpmCli(context.env, context.nodeExecutable),
      'exec',
      '--yes',
      '--',
      ...officialArgs,
    ],
  }
}

function boundedDuration(startedAt, completedAt) {
  return Math.min(86_400_000, Math.max(0, completedAt.getTime() - startedAt.getTime()))
}

function failureCode(result, inspection) {
  if (result.error) return 'SPAWN_FAILED'
  if (result.status !== 0) return 'OFFICIAL_CLI_FAILED'
  if (!inspection.afterPresent) return 'PROFILE_NOT_UPDATED'
  return null
}

export async function addPlugin(command, context) {
  const {
    dshHome,
    env,
    stderr,
    now = () => new Date(),
    uuid = randomUUID,
    spawn = spawnSync,
    fetchImpl = globalThis.fetch,
    platform: platformName = hostPlatform,
    arch: architecture = hostArch,
    execPath: nodeExecutable = hostExecPath,
  } = context
  const officialPackage = readCliEnv(env, 'DSH_PACKAGE') || DEFAULT_DSH_PACKAGE
  const receipts = await readReceipts(dshHome)
  const previousReceipt = getReceipt(receipts, command.profile, command.pluginId)
  const before = await readProfileState(dshHome, command.profile)

  let telemetryConfig = null
  try {
    telemetryConfig = await loadTelemetryConfig(dshHome)
    if (!telemetryConfig && !environmentDisablesTelemetry(env)) {
      telemetryConfig = (await ensureTelemetryConfig(dshHome, { now, uuid })).config
    }
    if (effectiveTelemetryEnabled(telemetryConfig, env) && await markNoticeShown(dshHome, telemetryConfig, now)) {
      stderr('DSH 1024Store records anonymous plugin install outcomes and timestamps. Disable with `npx dsh1024 telemetry disable`, `DO_NOT_TRACK=1`, or `DSH1024_TELEMETRY=0`. Details: https://github.com/imsai-sh/awesome-deepseek-harness-plugins/blob/main/docs/install-analytics.md')
    }
  } catch {
    // Telemetry storage must never block an installation.
  }

  const startedAt = now()
  const { executable, args } = officialCliInvocation(officialPackage, command, {
    env,
    nodeExecutable,
    platformName,
  })
  const result = spawn(executable, args, {
    env,
    shell: false,
    stdio: 'inherit',
  })
  const completedAt = now()
  const after = await readProfileState(dshHome, command.profile)
  const inspection = inspectInstallation(before, after, command.pluginId, previousReceipt, command.knownPackageNames ?? [])
  const errorCode = failureCode(result, inspection)
  const operation = inspection.beforePresent ? 'reinstall' : 'install'
  const succeeded = errorCode === null

  if (succeeded) {
    const receipt = createReceipt({
      previousReceipt,
      pluginId: command.pluginId,
      profile: command.profile,
      source: command.source,
      packageNames: inspection.packageNames,
      state: after,
      completedAt: completedAt.toISOString(),
    })
    try {
      await saveReceipt(dshHome, receipts, receipt)
    } catch {
      stderr('DSH 1024Store installed the plugin but could not save its local receipt.')
    }
  } else if (result.status === 0 && !inspection.afterPresent) {
    stderr('DSH 1024Store could not verify the plugin in the selected DSH profile after installation.')
  }

  if (telemetryConfig && effectiveTelemetryEnabled(telemetryConfig, env)) {
    const event = {
      eventId: uuid(),
      clientId: telemetryConfig.clientId,
      pluginId: command.pluginId,
      profile: command.profile,
      operation,
      status: succeeded ? 'success' : 'failed',
      clientStartedAt: startedAt.toISOString(),
      clientCompletedAt: completedAt.toISOString(),
      durationMs: boundedDuration(startedAt, completedAt),
      beforeVersion: inspection.beforeVersion,
      afterVersion: inspection.afterVersion,
      requestedRef: command.requestedRef,
      cliVersion: CLI_VERSION,
      dshVersion: officialDshVersion(officialPackage, env),
      errorCode,
      sourceChannel: 'dsh-1024store-cli',
      platform: detectPlatform(platformName),
      arch: detectArch(architecture),
      isCi: detectCi(env),
    }
    try {
      await enqueueEvent(dshHome, event)
      const flushed = await flushPending(dshHome, { env, fetchImpl })
      if (flushed.pending > 0) stderr('DSH 1024Store telemetry is queued locally and will retry on the next install.')
    } catch {
      stderr('DSH 1024Store could not persist telemetry; the plugin result is unchanged.')
    }
  }

  if (succeeded) return 0
  return Number.isInteger(result.status) && result.status > 0 ? result.status : 1
}
