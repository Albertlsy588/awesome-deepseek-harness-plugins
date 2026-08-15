/** Anonymous install telemetry aligned with the @dsh-1024store/cli event contract. */

import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { CURRENT_VERSION } from './update.ts'

export const DEFAULT_TELEMETRY_URL = 'https://deepseek1024.com/api/v1/install-events'
export const TELEMETRY_SOURCE_CHANNEL = 'dsh-1024store-plugin'
const TELEMETRY_NOTICE_VERSION = 1
const FETCH_TIMEOUT_MS = 2_500
const MAX_DURATION_MS = 86_400_000

const PRIVACY_NOTICE = 'DSH 1024Store records anonymous plugin install outcomes and timestamps. '
  + 'Disable with `DO_NOT_TRACK=1`, `DSH_1024STORE_TELEMETRY=0`, or `npx @dsh-1024store/cli telemetry disable`. '
  + 'Details: https://github.com/imsai-sh/awesome-deepseek-harness-plugins/blob/main/docs/install-analytics.md'

/** The exact public event schema shared with the CLI, the Worker, and the docs. */
export const EVENT_KEYS = [
  'eventId',
  'clientId',
  'pluginId',
  'profile',
  'operation',
  'status',
  'clientStartedAt',
  'clientCompletedAt',
  'durationMs',
  'beforeVersion',
  'afterVersion',
  'requestedRef',
  'cliVersion',
  'dshVersion',
  'errorCode',
  'sourceChannel',
  'platform',
  'arch',
  'isCi',
] as const

const PLATFORM_VALUES = new Set(['darwin', 'linux', 'win32', 'freebsd', 'aix', 'android'])
const ARCH_VALUES = new Set(['x64', 'arm64', 'arm', 'ia32', 'ppc64', 's390x', 'riscv64'])

export interface InstallEvent {
  eventId: string
  clientId: string
  pluginId: string
  profile: string
  operation: 'install' | 'remove'
  status: 'success' | 'failed'
  clientStartedAt: string
  clientCompletedAt: string
  durationMs: number
  beforeVersion: string | null
  afterVersion: string | null
  requestedRef: string | null
  cliVersion: string
  dshVersion: string | null
  errorCode: string | null
  sourceChannel: string
  platform: string
  arch: string
  isCi: boolean
}

export interface InstallEventInput {
  pluginId: string
  profile: string
  operation: 'install' | 'remove'
  status: 'success' | 'failed'
  startedAt: Date
  completedAt: Date
  errorCode: string | null
}

export interface TelemetryContext {
  env?: NodeJS.ProcessEnv
  fetcher?: typeof fetch
  now?: () => Date
  uuid?: () => string
  log?: (line: string) => void
  platform?: string
  arch?: string
}

interface TelemetryClientConfig {
  schemaVersion: number
  clientId: string
  enabled: boolean
  createdAt: string
  updatedAt: string
  noticeVersion: number
  noticeShownAt?: string
}

function isTrue(value: unknown): boolean {
  return ['1', 'true', 'on', 'yes'].includes(String(value ?? '').toLowerCase())
}

function isFalse(value: unknown): boolean {
  return ['0', 'false', 'off', 'no'].includes(String(value ?? '').toLowerCase())
}

/** Whether DO_NOT_TRACK / DSH_1024STORE_TELEMETRY turn telemetry off, mirroring the CLI. */
export function environmentDisablesTelemetry(env: NodeJS.ProcessEnv): boolean {
  return isTrue(env.DO_NOT_TRACK)
    || (env.DSH_1024STORE_TELEMETRY !== undefined && isFalse(env.DSH_1024STORE_TELEMETRY))
}

/** Reduce the host platform to the CLI's reporting whitelist. */
export function detectPlatform(value: string = process.platform): string {
  return PLATFORM_VALUES.has(value) ? value : 'unknown'
}

/** Reduce the host architecture to the CLI's reporting whitelist. */
export function detectArch(value: string = process.arch): string {
  return ARCH_VALUES.has(value) ? value : 'unknown'
}

/** Detect CI environments with the same probes as the CLI. */
export function detectCi(env: NodeJS.ProcessEnv): boolean {
  return isTrue(env.CI) || Boolean(env.GITHUB_ACTIONS || env.BUILDKITE || env.TF_BUILD || env.JENKINS_URL)
}

function clientConfigPath(env: NodeJS.ProcessEnv): string {
  return join(env.DSH_HOME ?? join(homedir(), '.dsh'), '.dsh-1024store', 'client.json')
}

function readClientConfig(path: string): TelemetryClientConfig | null {
  try {
    const config = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    if (config === null || typeof config !== 'object') return null
    if (config.schemaVersion !== 1 || typeof config.clientId !== 'string') return null
    return config as unknown as TelemetryClientConfig
  } catch {
    return null
  }
}

function writeClientConfig(path: string, config: TelemetryClientConfig): void {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
  writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, { flag: 'wx' })
  try {
    renameSync(temporary, path)
  } catch (error) {
    rmSync(temporary, { force: true })
    throw error
  }
}

function boundedDuration(startedAt: Date, completedAt: Date): number {
  return Math.min(MAX_DURATION_MS, Math.max(0, completedAt.getTime() - startedAt.getTime()))
}

function assertEventShape(event: InstallEvent): void {
  const keys = Object.keys(event)
  if (keys.length !== EVENT_KEYS.length || EVENT_KEYS.some(key => !keys.includes(key))) {
    throw new Error('telemetry event does not match the public event schema')
  }
}

/**
 * Report one plugin install/remove outcome to the public install-events API.
 * Fire-and-forget: no queue, 2.5s timeout, and every failure is silent so
 * telemetry can never affect a plugin operation. Respects DO_NOT_TRACK,
 * DSH_1024STORE_TELEMETRY, and an opted-out shared CLI identity; when opted
 * out no identity is created and nothing is sent.
 */
export async function reportInstallEvent(input: InstallEventInput, context: TelemetryContext = {}): Promise<void> {
  try {
    const env = context.env ?? process.env
    if (environmentDisablesTelemetry(env)) return
    const now = context.now ?? (() => new Date())
    const uuid = context.uuid ?? randomUUID
    const path = clientConfigPath(env)
    let config = readClientConfig(path)
    if (config !== null && config.enabled === false) return
    if (config === null) {
      const timestamp = now().toISOString()
      config = {
        schemaVersion: 1,
        clientId: uuid(),
        enabled: true,
        createdAt: timestamp,
        updatedAt: timestamp,
        noticeVersion: TELEMETRY_NOTICE_VERSION,
        noticeShownAt: timestamp,
      }
      writeClientConfig(path, config)
      ;(context.log ?? console.log)(PRIVACY_NOTICE)
    }
    const event: InstallEvent = {
      eventId: uuid(),
      clientId: config.clientId,
      pluginId: input.pluginId,
      profile: input.profile,
      operation: input.operation,
      status: input.status,
      clientStartedAt: input.startedAt.toISOString(),
      clientCompletedAt: input.completedAt.toISOString(),
      durationMs: boundedDuration(input.startedAt, input.completedAt),
      beforeVersion: null,
      afterVersion: null,
      requestedRef: null,
      cliVersion: CURRENT_VERSION,
      dshVersion: null,
      errorCode: input.errorCode,
      sourceChannel: TELEMETRY_SOURCE_CHANNEL,
      platform: detectPlatform(context.platform),
      arch: detectArch(context.arch),
      isCi: detectCi(env),
    }
    assertEventShape(event)
    const fetcher = context.fetcher ?? fetch
    const endpoint = env.DSH_1024STORE_TELEMETRY_URL || DEFAULT_TELEMETRY_URL
    await fetcher(endpoint, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': 'dsh-1024store',
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch {
    // Telemetry must never block or fail a plugin operation.
  }
}
