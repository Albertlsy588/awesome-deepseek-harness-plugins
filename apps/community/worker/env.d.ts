/**
 * Bindings that deliberately do not appear in wrangler.jsonc.
 *
 * `wrangler types` derives Env from the config file, and this one is absent
 * from it on purpose: it is set only in `.dev.vars`, which is git-ignored and
 * never uploaded, so no deploy can carry it. See lib/session.ts.
 */
declare global {
  interface Env {
    COMMUNITY_DEV_LOGIN?: string
  }
}

export {}
