# API reference (v1)

All public endpoints live under `https://deepseek1024.com/api/v1/`. The Worker is the only
process that reads or writes the D1 catalog; every response is served from a 15-minute KV
snapshot of D1, and stale KV is the only degradation mode. Legacy paths (`/api/plugin`,
`/api/plugin/:owner/:name`, `/plugins.json`, `/api/install-stats/:owner/:name`,
`/api/dsh-1024store`, `/api/packages*`, `/api/health`) are removed without compatibility
shims.

## GET /api/v1/plugins

Query parameters: `q` (search), `category`, `sort`.

Returns the catalog listing used by the website: `packages`, `rankings`, `categories`, and
`meta`. The response structure matches the previous catalog payload; only the path changed.

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
    "install": "npx @dsh-1024store/cli add owner/repository --profile web",
    "added": "2026-08-15",
    "stars": 12
  }]
}
```

`stars` is `null` when unknown. The registry is projected from the same KV snapshot as the
other read endpoints.

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

`/` serves the rankings page; `/packages*` returns `301` to the matching `/plugin*` page.
