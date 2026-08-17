/**
 * The bindings the community's routes actually use.
 *
 * It does not read `apps/web/worker-configuration.d.ts`, even though that is the
 * generated truth for this Worker: wrangler's output does
 * `import("./worker/index")` to type the Durable Object namespace, which would
 * pull the entire site Worker — catalog, SEO, cron tasks — into this project and
 * its `tsc -b` boundary. Declaring the bindings this app touches keeps the two
 * source trees independent.
 *
 * `Env` is a global interface, so `apps/web` sees this file too (it is in that
 * project's include). A binding declared here with the wrong type therefore
 * fails the site's typecheck, which is where the generated truth lives.
 *
 * COMMUNITY_DEV_LOGIN is optional and appears in no wrangler config on purpose:
 * it is set only in git-ignored `.dev.vars`, and `wrangler deploy` does not read
 * those. See worker/lib/session.ts.
 */
declare global {
  interface Env {
    CATALOG_DB: D1Database
    ASSETS: Fetcher
    COMMUNITY_ADMIN_LOGINS: string
    COMMUNITY_DEV_LOGIN?: string
  }
}

export {}
