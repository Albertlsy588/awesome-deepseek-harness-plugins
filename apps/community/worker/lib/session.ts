import type { Context } from 'hono'
import {
  createSession,
  deleteSessions,
  readCookieValues,
  resolveSessionUser,
  SESSION_COOKIE,
  sessionCookieDomain,
  SESSION_TTL_MS,
  upsertGitHubUser,
  type ApiUser,
} from '@dsh-1024store/core/auth'
import { setCookie } from 'hono/cookie'

export type CommunityContext = Context<{ Bindings: Env }>

export interface Signer {
  user: ApiUser
  admin: boolean
}

/**
 * The community never runs an OAuth exchange. A GitHub OAuth App accepts one
 * callback URL, which belongs to the main site, so sign-in happens there and
 * hands the session back through a cookie scoped to the registrable domain.
 * Here we only read `api_sessions` — the same rows, the same shared code.
 */
export async function currentUser(context: CommunityContext): Promise<Signer | null> {
  if (!context.env?.CATALOG_DB) return null
  const user = await resolveSessionUser(
    context.env.CATALOG_DB,
    context.req.header('Cookie'),
    Date.now(),
  )
  if (!user) return null
  return { user, admin: isAdmin(context.env.COMMUNITY_ADMIN_LOGINS, user.githubLogin) }
}

export function isAdmin(configured: string | undefined, login: string): boolean {
  if (!configured) return false
  return configured
    .split(',')
    .map((entry) => entry.trim().toLocaleLowerCase('en-US'))
    .filter((entry) => entry.length > 0)
    .includes(login.toLocaleLowerCase('en-US'))
}

/** Where the community sends a reader who wants to sign in. */
export function signInUrl(requestUrl: string, returnTo: string): string {
  const self = new URL(requestUrl)
  const site = new URL(self)
  site.search = ''
  site.hash = ''
  if (self.hostname === 'community.deepseek1024.com') {
    site.hostname = 'deepseek1024.com'
  } else {
    // Local development: the OAuth callback is registered against the main
    // app's port, so sign-in has to go there and come back.
    site.port = '5641'
  }
  site.pathname = '/api/v1/auth/github/login'
  const target = new URL(returnTo, requestUrl)
  target.search = ''
  target.hash = ''
  site.searchParams.set('returnTo', new URL(returnTo, requestUrl).toString())
  return site.toString()
}

export async function signOut(context: CommunityContext): Promise<void> {
  const tokens = readCookieValues(context.req.header('Cookie'), SESSION_COOKIE)
  if (tokens.length > 0 && context.env?.CATALOG_DB) {
    await deleteSessions(context.env.CATALOG_DB, tokens)
  }
  const domain = sessionCookieDomain(context.req.url)
  setCookie(context, SESSION_COOKIE, '', { path: '/', maxAge: 0 })
  if (domain) setCookie(context, SESSION_COOKIE, '', { path: '/', domain, maxAge: 0 })
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

/**
 * A sign-in that mints a session without GitHub, for local work only.
 *
 * Two independent gates, either of which alone is enough to disable it:
 * `COMMUNITY_DEV_LOGIN` is set nowhere but `.dev.vars` (git-ignored, never
 * uploaded, and absent from wrangler.jsonc so no deploy can carry it), and the
 * request must arrive on a loopback host, which no deployed Worker ever sees.
 * It exists because the real OAuth App's callback is registered against a
 * specific port, so a machine without those client secrets otherwise cannot
 * exercise a signed-in page at all.
 */
export function devLoginEnabled(context: CommunityContext): boolean {
  return context.env?.COMMUNITY_DEV_LOGIN === '1' &&
    isLoopback(new URL(context.req.url).hostname)
}

export async function createDevSession(context: CommunityContext, login: string): Promise<void> {
  const nowMs = Date.now()
  const user = await upsertGitHubUser(
    context.env.CATALOG_DB,
    {
      // Negative ids cannot collide with a real GitHub account id, so a
      // development row can never be mistaken for, or overwrite, a real user.
      id: -Math.abs([...login].reduce((value, char) => (value * 31 + char.charCodeAt(0)) % 1_000_000, 7)) - 1,
      login,
      name: login,
      avatarUrl: null,
    },
    new Date(nowMs).toISOString(),
  )
  const session = await createSession(context.env.CATALOG_DB, user.id, nowMs)
  setCookie(context, SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  })
}
