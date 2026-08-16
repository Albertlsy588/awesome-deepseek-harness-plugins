# API reference (v1)

The public developer API lives on its own host: `https://api.deepseek1024.com/v1/…`
(currently only the search endpoint and `/v1/health`; everything else on that host is 404,
and the bare host redirects to the website docs page). The same Worker serves both hosts —
`api.deepseek1024.com` paths are rewritten onto the internal `/api/v1/…` routes below, so
handler behaviour, quotas, and error codes are identical. `api.deepseek1024.com` is
registered as a second custom domain of the `dsh-store` Worker via `wrangler.jsonc`
`routes` and is provisioned automatically on deploy.

All internal endpoints live under `https://deepseek1024.com/api/v1/`. The Worker is the only
process that reads or writes the D1 catalog; every response is served from a 15-minute KV
snapshot of D1, and stale KV is the only degradation mode. Legacy paths (`/api/plugin`,
`/api/plugin/:owner/:name`, `/plugins.json`, `/api/install-stats/:owner/:name`,
`/api/dsh-1024store`, `/api/packages*`, `/api/health`) are removed without compatibility
shims.

## GET /api/v1/plugins

Query parameters: `q` (search), `category`, `sort`.

Returns the catalog listing used by the website: `packages`, `rankings`, `categories`, and
`meta`. The response structure matches the previous catalog payload; only the path changed.

## GET /api/v1/plugins/search

Rate-limited keyword search over the catalog snapshot, mirrored on the website at
[`/docs/api`](https://deepseek1024.com/docs/api). The canonical public URL is
`https://api.deepseek1024.com/v1/plugins/search`; the main-domain path remains as the
internal alias. `q` is required; matches package name, owner, repository, category, and
both description languages.

Query parameters: `q` (required, ≤120 chars), `page` (default 1), `limit` (default 20, max
100), `sortBy` (`stars` default, `recent` as an alias of `newest`, or any catalog sort —
the `growth*` sorts additionally exclude plugins without enough recorded star history),
`category` (must be a known category id, otherwise `400 INVALID_CATEGORY`).

Authentication is optional: anonymous callers get 50 requests/day and 10/minute (keyed by
HMAC-hashed client IP; the raw IP is never stored), while requests carrying
`Authorization: Bearer dsh_live_…` from a GitHub-login account get 500/day and 30/minute.
Authenticated quotas are keyed to the **account**, not the individual key, so creating or
rotating keys does not multiply or reset the window.
Every response carries `X-RateLimit-Daily-Limit` / `X-RateLimit-Daily-Remaining`; `429`
responses add `Retry-After`. Unlike the other read endpoints the search response is
`Cache-Control: no-store`.

Error codes (JSON `{"error": "…", "code": "…"}`): `MISSING_QUERY` (400),
`INVALID_CATEGORY` (400), `INVALID_API_KEY` (401), `RATE_LIMITED` (429, minute window —
does not consume daily quota), `DAILY_QUOTA_EXCEEDED` (429), `SERVICE_UNAVAILABLE` (503).

Response: `{"query", "page", "limit", "sortBy", "total", "totalPages", "results": [...]}`
where each result carries the registry projection fields (`id`, `name`, `owner`, `url`,
`category`, `description`, `install`, `added`, `stars`) plus `installCount`, `growth24h`,
and `pushedAt`.

## Account & API-key endpoints

GitHub OAuth is the only sign-in method; the Worker needs the `GITHUB_OAUTH_CLIENT_ID` and
`GITHUB_OAUTH_CLIENT_SECRET` secrets (endpoints answer `503` while they are unset at
runtime). **Deploy prerequisite:** both are listed in `wrangler.jsonc` `secrets.required`,
and wrangler 4 refuses to deploy a Worker whose secret store is missing a required secret —
run `wrangler secret put GITHUB_OAUTH_CLIENT_ID` / `wrangler secret put
GITHUB_OAUTH_CLIENT_SECRET` once before the first deploy of this feature. Sessions
are 30-day `dsh_session` cookies (HttpOnly, Secure, SameSite=Lax) whose SHA-256 hash lives
in D1; API keys are shown once at creation and stored only as hashes.

- `GET /api/v1/auth/github/login?returnTo=/account` — redirects to GitHub authorize with a
  state cookie; `returnTo` accepts same-site absolute paths only.
- `GET /api/v1/auth/github/callback` — validates state, exchanges the code, upserts the
  user by GitHub id, sets the session cookie, redirects to `returnTo` (or
  `/account?login=error` on failure).
- `GET /api/v1/auth/me` — `{"user": {"githubLogin", "githubName", "avatarUrl"}}` or
  `{"user": null}`; always 200, `Cache-Control: no-store`.
- `POST /api/v1/auth/logout` — deletes the session row and clears the cookie.
- `GET /api/v1/api-keys` — lists the caller's active keys (id, name, `keyPrefix`,
  timestamps; never the secret).
- `POST /api/v1/api-keys` — body `{"name"?}`; returns the full key exactly once
  (`dsh_live_` + 40 hex chars). At most 5 active keys per user
  (`400 KEY_LIMIT_REACHED`).
- `DELETE /api/v1/api-keys/:id` — revokes (soft-deletes) the key.

Cookie-authenticated mutations reject mismatched `Origin` headers (`403`); expired
sessions and stale rate counters are purged by the weekly cron.

## GET /api/v1/plugins/:owner/:name

Returns the plugin detail payload, extended with the plugin's category definition so clients
do not hard-code category tables:

```json
"category": { "id": "tools", "order": 50, "label": { "en": "Tools & Capabilities", "zh": "工具与能力" } }
```

Plugins that were only discovered by the topic scan and carry no curated metadata return the
built-in descriptor
`{ "id": "unclassified", "order": 1000, "label": { "en": "Unclassified", "zh": "待分类" } }`.
`category` is `null` only when the stored category id is no longer recognised — that is, the
id is neither in `catalog/categories.json` nor `unclassified` (for example, a category that
was removed from the configuration after plugins referenced it).

## GET /api/v1/registry

Compact full-catalog registry for the `dsh-1024store` marketplace plugin, the README builder
(`scripts/build-readme.mjs`), and external tools:

```json
{
  "name": "dsh-1024store-catalog",
  "updated": "<ISO 8601>",
  "count": 1492,
  "categories": [{ "id": "ui", "order": 10, "label": { "en": "UI Enhancements", "zh": "UI 增强" } }],
  "plugins": [{
    "id": "owner/repository",
    "name": "repository",
    "owner": "owner",
    "url": "https://github.com/owner/repository",
    "category": "tools",
    "description": { "en": "…", "zh": "…" },
    "install": "dsh plugin --profile web add github:owner/repository",
    "added": "2026-08-15",
    "stars": 12
  }]
}
```

`stars` is `null` when unknown. The registry is projected from the same KV snapshot as the
other read endpoints. The `install` field always carries the official DeepSeek Harness CLI
command; tracked wrapper commands (`npx @dsh-1024store/cli add …`) are derived at the
presentation layer and never stored in the registry.

## POST /api/v1/install-events

Anonymous install-event ingestion for the wrapper CLI (`sourceChannel: "dsh-1024store-cli"`)
and the in-DSH marketplace plugin (`sourceChannel: "dsh-1024store-plugin"`).

- The event schema (19 fields) is unchanged; see
  [install analytics](install-analytics.md) for field semantics and
  `apps/web/worker/lib/install-metrics.ts` for the authoritative validation code.
- There is **no catalog-membership gate**: a well-formed event is recorded even when the
  plugin is not in the published catalog.
- Retained protections: strict field validation, `Content-Type: application/json`, 8 KB body
  limit, per-client rate limiting, HMAC anonymization of the client ID, and event-ID
  idempotency.

## POST /api/v1/catalog/sync

Full-catalog reconciliation from GitHub CI — one of exactly two catalog write paths (the
other is the Worker's own cron topic scan).

Authentication: `Authorization: Bearer <CATALOG_SYNC_TOKEN>` where the token is a Cloudflare
Worker secret of at least 32 bytes. The endpoint is not a public submission API: anonymous and
incorrectly authenticated callers cannot create or update catalog entries. Every accepted
repository URL must be the canonical `https://github.com/<owner>/<repository>` URL matching the
entry ID. Responses:

- `503` when the secret is missing or too short on the Worker;
- `401` when the token does not match (constant-time comparison);
- `200 {"ok": true, "total": N, "removedSources": M}` on success.

Request body (produced by `scripts/sync-catalog.mjs` from `catalog/plugins/*.json`, with the
`$schema` field stripped):

```json
{
  "source": "github_ci",
  "entries": [{
    "id": "owner/repository",
    "name": "repository",
    "repository": "https://github.com/owner/repository",
    "category": "tools",
    "description": { "en": "…", "zh": "…" },
    "added": "2026-08-15"
  }]
}
```

Behavior: upserts `catalog_repositories`, their `github_pr` source rows, and curated
metadata; entries absent from the body lose their `github_pr` source and metadata while the
repository row itself is preserved (no data loss). The call is idempotent through the upserts
themselves — there is no revision gate — and finishes by refreshing the KV snapshot.

## GET /api/v1/health

Returns exactly `{"status":"ok"}`. No scan or database internals are exposed.

## Page redirects

`/` serves the rankings page without changing the browser URL. `/plugins*` is the canonical catalog path; singular `/plugin*` and legacy `/packages*` paths return `301` to the matching `/plugins*` page.
