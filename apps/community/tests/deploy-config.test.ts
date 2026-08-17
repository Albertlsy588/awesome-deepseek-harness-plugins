import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The deployed surface, asserted against the config file itself.
 *
 * These are invariants a reader cannot check by reading one function: they are
 * properties of what gets uploaded. Each one is a mistake that would look
 * harmless in review.
 */
const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')

describe('wrangler.jsonc', () => {
  it('never declares the development sign-in flag', () => {
    // The flag lives only in .dev.vars, which is git-ignored and which
    // `wrangler deploy` does not read. Declaring it here — or promoting it out
    // of .dev.vars because it showed up in dist/ next to the built worker,
    // where the Vite plugin copies it for `vite preview` — would leave the
    // loopback hostname check as the only thing standing between a visitor and
    // a session for any login they care to name.
    expect(wrangler).not.toContain('COMMUNITY_DEV_LOGIN')
  })

  it('binds only the community hostname', () => {
    const patterns = [...wrangler.matchAll(/"pattern":\s*"([^"]+)"/g)].map((match) => match[1])
    // apps/web/wrangler.jsonc owns deepseek1024.com, www, and api. Each routes
    // array is the authoritative binding list for its own Worker, so an overlap
    // here would have two Workers fighting over one hostname.
    expect(patterns).toEqual(['community.deepseek1024.com'])
  })

  it('points at the same D1 as the main site', () => {
    // Shared users, shared sessions, shared catalog. A second database would
    // silently give the community its own copy of everyone's account.
    expect(wrangler).toContain('"database_id": "57006b9f-17e1-466f-b941-71c35cbff092"')
    expect(wrangler).toContain('"binding": "CATALOG_DB"')
  })

  it('ships no secrets of its own', () => {
    // Sign-in happens on the main site, so the community must never hold the
    // OAuth client secret. If this starts failing, the auth topology changed.
    expect(wrangler).not.toContain('GITHUB_OAUTH_CLIENT_SECRET')
    expect(wrangler).not.toContain('secrets')
  })
})
