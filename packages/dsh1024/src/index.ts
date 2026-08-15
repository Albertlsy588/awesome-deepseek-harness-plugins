/** 1024 Store market host plugin. */

import type { Context } from '@deepseek-ai/cordis'
import { DEFAULT_REGISTRY_URL } from './registry.ts'
import { mountMarketRoutes, type WebServerService } from './routes.ts'
import { DEFAULT_UPDATE_URL } from './update.ts'

export const name = 'dsh1024'

export interface Config {
  /** DSH profile that owns plugin mutations. Defaults to the booted profile. */
  profile?: string
  /** HTTPS registry endpoint. */
  registryUrl?: string
  /** HTTPS endpoint that reports the latest dsh1024 version. */
  updateUrl?: string
}

interface MarketContext extends Context {
  webServer: WebServerService
}

function argvProfile(): string | undefined {
  const index = process.argv.indexOf('--profile')
  const candidate = index >= 0 ? process.argv[index + 1] : undefined
  return candidate !== undefined && !candidate.startsWith('-') ? candidate : undefined
}

/**
 * Mount the market routes after the web server service becomes available.
 * @param ctx - Cordis host context.
 * @param config - optional profile and registry overrides.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const resolved = {
    profile: config.profile ?? argvProfile() ?? 'web',
    registryUrl: config.registryUrl ?? DEFAULT_REGISTRY_URL,
    updateUrl: config.updateUrl ?? DEFAULT_UPDATE_URL,
  }
  ctx.inject(['webServer'], hostContext => {
    const host = hostContext as MarketContext
    host.effect(
      () => mountMarketRoutes(host.webServer, resolved),
      'dsh1024: http routes',
    )
  })
}
