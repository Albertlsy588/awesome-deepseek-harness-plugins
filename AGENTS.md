# Repository instructions

## Public URL stability

- Canonical public paths: `/` (rankings), `/plugins` (catalog), `/plugins/:owner/:name` (plugin detail), `/docs/api` (public API reference), `/account` (noindex).
- Plugin API routes use the `/api/v1/` prefix with plural resources (`/api/v1/plugins`, `/api/v1/plugins/:owner/:name`). The outward-facing search API is `https://api.deepseek1024.com/v1/plugins/search`.
- `/plugin`, `/plugin/:owner/:name`, `/packages`, `/packages/:owner/:name` and `/rankings` are permanent 301 **sources only**. Do not cite them as live URLs.
- Treat public route paths as permanent SEO contracts. Do not rename or remove them without explicit user approval and a migration plan covering permanent redirects, canonical URLs, and existing inbound links.
- Page titles, descriptions, JSON-LD and the crawlable pre-hydration shell all come from `apps/web/worker/seo-templates.ts` and `apps/web/worker/seo-content.ts`. Both the Worker and the React app import them; never fork the copy into a page component or a translation file.
- When replacing an already-published route, keep a permanent redirect from the old path to the canonical path.

## Bound hostnames and the public API surface

The Worker answers on three custom domains, all declared in `apps/web/wrangler.jsonc`
under `routes`, and each host has a deliberately different surface. `apps/web/worker/public-api.ts`
is the single place that decides which is which; `apps/web/tests/public-api.test.ts` guards it.

- `deepseek1024.com` — the website and the full `/api/...` surface, including sign-in and API-key
  management. This is the only host that serves the site.
- `www.deepseek1024.com` — a bound custom domain that exists solely to `301` to the apex host
  (`wwwRedirect`). It is not an alias you can serve content from.
- `api.deepseek1024.com` — the public developer API. It exposes an **allow-list of two paths**,
  `PUBLIC_API_PATHS` in `public-api.ts`, rewritten onto the internal routes:
  `/v1/plugins/search` → `/api/v1/plugins/search`, and `/v1/health` → `/api/v1/health`.

That host exists for third-party consumers, and its one substantive endpoint is metered
independently of the site. `/v1/plugins/search` enforces a per-caller quota — `ANONYMOUS_QUOTA`
and `AUTHENTICATED_QUOTA` in `packages/dsh-core/src/api-quota.ts`, counters kept in D1 through
`consumeQuota`: 10/min and 50/day anonymous, 30/min and 500/day with a key. Anonymous callers are
keyed by `ip:<HMAC of CF-Connecting-IP>` so the raw address never reaches D1; authenticated callers
are keyed by `user:<id>` and not by key id, so rotating or minting keys cannot open a fresh window.
Every response carries `X-RateLimit-Daily-Limit` and `X-RateLimit-Daily-Remaining`; a rejection adds
`Retry-After` and returns `429`, with `DAILY_QUOTA_EXCEEDED` for the day window and `RATE_LIMITED`
for the minute window. `/v1/health` is deliberately unmetered.

The quota lives on the search handler in `apps/web/worker/app.ts`, not on the host check, so
`deepseek1024.com/api/v1/plugins/search` draws down the same counters.

Four ways this gets broken, in rough order of likelihood:

1. **Assuming a 404 on `api.deepseek1024.com` is a bug.** Every path outside the allow-list returns
   `404 {"code":"NOT_FOUND"}` on purpose, and `/` returns `302` to `/docs/api`. So
   `api.deepseek1024.com/v1/registry` and `.../api/v1/registry` both 404 while
   `deepseek1024.com/api/v1/registry` works — that is the design, not a routing fault. Verify the
   host is healthy with `/v1/health`, which returns `{"status":"ok"}`.
2. **Expecting a new internal endpoint to appear on the API host.** Adding `/api/v1/<thing>` to the
   Worker does *not* publish it at `api.deepseek1024.com/v1/<thing>`. Publishing is a separate,
   deliberate act: add the mapping to `PUBLIC_API_PATHS`. Keep sign-in, key management, and anything
   session- or cookie-bearing off this host.
3. **Publishing a public endpoint without metering it.** Adding a path to `PUBLIC_API_PATHS` only
   routes it; the quota is per-handler. A new public endpoint that never calls `consumeQuota` is
   unmetered on an unauthenticated host. Decide the tier deliberately, and keep `/v1/health` the
   only unmetered entry.
4. **Editing `routes` without listing every domain.** That array is the authoritative binding list,
   not a patch. Deploying with a custom domain missing unbinds it, and requests to the dropped
   hostname start failing with `522`. Always keep all three entries; only ever add.

Deploying is a deliberate local act, not a consequence of pushing: run `npm run deploy` (its
`predeploy` builds first). Landing a change on `main` publishes nothing until someone does.
When the change carries a D1 migration, export a backup first, apply the migration, and only
then deploy — the Worker and the schema must move together, and a Worker deployed against the
old schema cannot read the catalog:

```bash
npx wrangler d1 export CATALOG_DB --remote --output=catalog-backup-$(date +%Y%m%d-%H%M).sql
npm run db:migrate:remote --workspace @dsh-1024store/web
npm run deploy
```

Extend `apps/web/tests/public-api.test.ts` whenever you change which host serves what.

## Two Workers, one database, one sign-in

`apps/web` and `apps/community` are separate Workers on separate hostnames, bound to the **same**
D1. The community never runs an OAuth exchange: a GitHub OAuth App accepts exactly one callback
URL, and that URL belongs to `deepseek1024.com`. So sign-in always happens on the main site, and
the session it issues is readable on both hosts.

That works because of three things, all of which live in `packages/dsh-core/src/auth.ts`:

1. **The session cookie carries `Domain=deepseek1024.com`** (`sessionCookieDomain`), so the
   subdomain receives it. On localhost the attribute is omitted — a bare hostname cannot carry
   one — which is harmless, because cookies are not isolated by port and a session minted at
   `localhost:5641` already reaches a dev server on another port.
2. **`sanitizeReturnTo` has a hardcoded cross-site allow-list** (`CROSS_SITE_RETURN_HOSTS`). It is
   deliberately not configurable: an environment variable there is one typo away from an open
   redirect. A same-site path still returns unchanged; a loopback peer is allowed only when the
   sign-in request itself arrived on loopback.
3. **Every `dsh_session` value is read and revoked, not just the first.** The cookie used to be
   host-only, so a browser that signed in before the change presents *two* cookies of that name
   and sends both. `readCookieValues` / `resolveSessionUser` / `deleteSessions` handle the set;
   reading only the first would leave a live session row behind after sign-out — a signed-out page
   over a live session. `apps/web/tests/auth-api.test.ts` guards this.

Three ways this gets broken:

1. **Adding a host to `CROSS_SITE_RETURN_HOSTS` without thinking.** Anything listed there can
   receive a live session. Only hosts this project controls belong in it.
2. **Reaching for `getCookie(context, SESSION_COOKIE)` again.** Hono returns the first match. Use
   `resolveSessionUser`, or the migration hazard above comes back.
3. **Editing `routes` in either `wrangler.jsonc`.** Each file is the authoritative binding list for
   its own Worker. `apps/web` owns the three main hostnames; `apps/community` owns
   `community.deepseek1024.com`. They must never overlap, and a deploy that drops an entry unbinds
   that hostname.

The community's schema lives in `apps/community/migrations/`, numbered independently — wrangler
tracks applied migrations by filename in a shared `d1_migrations` table, and the two sets never
collide. Ordering does matter once: community tables reference `api_users`, which the web app's
`0004_api_accounts.sql` creates, so the root `db:migrate:local` / `db:migrate:remote` scripts run
the web migrations first. Deploy the two Workers separately: `npm run deploy` and
`npm run deploy:community`.

There is a development-only sign-in at `/api/v1/community/dev-login`, gated on **both** a
`COMMUNITY_DEV_LOGIN` var that exists only in git-ignored `.dev.vars` (and deliberately not in
`wrangler.jsonc`, so no deploy can carry it) **and** a loopback hostname. Never move that flag
into `wrangler.jsonc`.

`.dev.vars` shows up in `dist/dsh_community/` after a build. That is the Vite plugin staging it for
`vite preview`; it is not in the uploaded assets (`dist/client/`) and not in the deploy manifest
(`dist/dsh_community/wrangler.json`), and `wrangler deploy` does not read `.dev.vars` at all.
`apps/community/tests/deploy-config.test.ts` asserts the flag never appears in `wrangler.jsonc`.

## Responsive web support

- The website supports both desktop and mobile devices. Treat both layouts as first-class release requirements.
- Start from the narrow layout and progressively enhance it. Do not rely on fixed desktop widths, hover-only interactions, or desktop-only information hierarchy.
- For every UI, layout, spacing, or typography change, design and verify both desktop and touch-enabled mobile viewports; do not approve a change based on desktop appearance alone.
- As a minimum, run `npm run test:visual` and check representative viewports around 1440×900, 390×844, and 320×568. Confirm there is no unintended page-level horizontal overflow, clipping, overlap, or content hidden behind sticky UI or safe areas.
- Primary buttons, icon buttons, tabs, filters, and other repeated controls must provide at least a 44×44 CSS-pixel touch target on mobile. Inputs must use a 16px or larger font on mobile so iOS does not zoom the page on focus.
- Keep body and explanatory copy readable on mobile (normally at least 12px for compact metadata and 14px for prose). Prefer reflowing or intentionally scrollable local regions over shrinking text to make desktop layouts fit.
- Horizontal chip, tab, table, code, and README overflow must stay inside an intentional local scroller with touch panning; the document itself must never scroll horizontally.
- Preserve task priority when content stacks: primary actions and safety information come before secondary metadata, and long-form content comes afterward.
- When changing responsive behavior, extend `apps/web/scripts/visual-check.mjs` with a regression assertion for the affected mobile interaction or layout invariant.
