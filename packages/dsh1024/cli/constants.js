import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

export const CLI_VERSION = packageJson.version
export const DEFAULT_PROFILE = 'web'
export const DEFAULT_DSH_PACKAGE = '@deepseek-ai/dsh'
export const DEFAULT_TELEMETRY_URL = 'https://deepseek1024.com/api/v1/install-events'
export const TELEMETRY_NOTICE_VERSION = 1

export function readCliEnv(env, suffix) {
  const modern = env[`DSH1024_${suffix}`]
  return modern !== undefined ? modern : env[`DSH_1024STORE_${suffix}`]
}

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
]
