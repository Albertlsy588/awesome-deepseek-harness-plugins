import { randomUUID } from 'node:crypto'
import { spawn as spawnChild } from 'node:child_process'
import { accessSync, constants as fsConstants } from 'node:fs'
import { win32 as win32Path, posix as posixPath } from 'node:path'
import { arch as hostArch, execPath as hostExecPath, platform as hostPlatform } from 'node:process'
import { CLI_VERSION, DEFAULT_DSH_PACKAGE, readCliEnv } from './constants.js'
import { runPluginCommand } from '../lib/shared/install-runner.js'
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
  // A PATH-resolved binary carries no version in its spec; report null rather
  // than guessing, exactly as an unparseable package spec already does.
  if (typeof packageSpec !== 'string' || packageSpec.length === 0) return null
  const separator = packageSpec.lastIndexOf('@')
  const slash = packageSpec.lastIndexOf('/')
  return separator > slash ? packageSpec.slice(separator + 1, separator + 65) : null
}

function isExecutableFile(candidate, canExecute) {
  try {
    return canExecute(candidate) === true
  } catch {
    return false
  }
}

function defaultCanExecute(candidate) {
  accessSync(candidate, fsConstants.X_OK)
  return true
}

/**
 * Locate an already-installed official `dsh` on PATH.
 *
 * Reusing it skips the npx resolution step on every single install, which is
 * the bulk of the wrapper's overhead. Returns null when nothing is found, and
 * the caller falls back to `npx --yes <package>`.
 */
export function findOfficialCliOnPath(context) {
  const { env, platformName, canExecute = defaultCanExecute } = context
  const rawPath = env.PATH ?? env.Path ?? env.path
  if (typeof rawPath !== 'string' || rawPath.length === 0) return null

  const windows = platformName === 'win32'
  const pathModule = windows ? win32Path : posixPath
  const separator = windows ? ';' : ':'
  const extensions = windows
    ? (typeof env.PATHEXT === 'string' && env.PATHEXT.length > 0 ? env.PATHEXT : '.COM;.EXE;.BAT;.CMD')
      .split(';')
      .map((extension) => extension.trim())
      .filter(Boolean)
    : ['']

  for (const directory of rawPath.split(separator)) {
    if (!directory) continue
    for (const extension of extensions) {
      const candidate = pathModule.join(directory, `dsh${extension.toLowerCase()}`)
      if (isExecutableFile(candidate, canExecute)) return candidate
    }
  }
  return null
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

function officialCliInvocation(officialPackage, context) {
  // An explicit package override must stay pinnable, so it always goes through
  // npx. Otherwise prefer a `dsh` already on PATH: it is the same official CLI
  // and skips npx's resolution on every install.
  if (!context.packageOverridden) {
    const onPath = findOfficialCliOnPath(context)
    if (onPath) return { file: onPath, prefixArgs: [], useShell: false }
  }

  if (context.platformName !== 'win32') {
    return { file: 'npx', prefixArgs: ['--yes', officialPackage], useShell: false }
  }

  return {
    file: context.nodeExecutable,
    prefixArgs: [
      windowsNpmCli(context.env, context.nodeExecutable),
      'exec',
      '--yes',
      '--',
      officialPackage,
    ],
    useShell: false,
  }
}

function boundedDuration(startedAt, completedAt) {
  return Math.min(86_400_000, Math.max(0, completedAt.getTime() - startedAt.getTime()))
}

function failureCode(result, inspection) {
  if (result.error !== null) return 'SPAWN_FAILED'
  if (result.exitCode !== 0) return 'OFFICIAL_CLI_FAILED'
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
    spawn = spawnChild,
    fetchImpl = globalThis.fetch,
    platform: platformName = hostPlatform,
    arch: architecture = hostArch,
    execPath: nodeExecutable = hostExecPath,
  } = context
  const packageOverride = readCliEnv(env, 'DSH_PACKAGE')
  const officialPackage = packageOverride || DEFAULT_DSH_PACKAGE
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
  const invocation = officialCliInvocation(officialPackage, {
    env,
    nodeExecutable,
    platformName,
    packageOverridden: Boolean(packageOverride),
    canExecute: context.canExecute,
  })
  const result = await runPluginCommand({
    invocation,
    action: 'add',
    profile: command.profile,
    target: command.source,
    extraArgs: command.passthroughArgs,
    stdio: 'inherit',
    env,
    spawnImpl: spawn,
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
  } else if (result.exitCode === 0 && !inspection.afterPresent) {
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
      dshVersion: invocation.prefixArgs.length === 0
        ? officialDshVersion('', env)
        : officialDshVersion(officialPackage, env),
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
  return Number.isInteger(result.exitCode) && result.exitCode > 0 ? result.exitCode : 1
}
