# Repository layout

## Decision

The Awesome catalog and the online marketplace live in one repository, with `catalog/` and `apps/web/` as explicit ownership boundaries. Plugin authors contribute one isolated source entry; maintainers update the human-readable lists and runtime projections separately.

```text
plugin source entry -> static review -> maintainer projections -> Worker build -> Cloudflare deploy
```

## Directory responsibilities

| Path | Responsibility | Manually edited |
| --- | --- | --- |
| `catalog/plugins/*.json` | Canonical plugin identity, category, bilingual descriptions, and added date | Yes |
| `catalog/categories.json` | Category IDs, order, and bilingual labels | Yes |
| `catalog/schema/` | Contributor-facing JSON contract | Yes |
| `README.md` | Primary Chinese plugin directory | No |
| `catalog/README.md` | English plugin directory | No |
| `catalog/generated/` | Stable public registry artifact | No |
| `apps/web/src/` | React interface | Yes |
| `apps/web/worker/` | Hono API, GitHub metrics, KV snapshots, and live statistics | Yes, except `data/registry.generated.json` |
| `apps/web/public/` | Static assets copied by Vite | No for generated catalog files |
| `scripts/` | Trusted pull-request review and its tests | Yes |

## Why JSON entries are canonical

The reference project uses two localized README files as its source and reconstructs data with a Markdown regular expression. That is easy to start with, but it allows locale drift, makes validation indirect, and forces contributors to edit shared long files.

One structured file per plugin gives this repository:

- schema validation before deployment;
- smaller pull-request diffs and fewer merge conflicts;
- one place to update bilingual metadata;
- deterministic derivation of owner and install commands;
- a stable input for future moderation, signatures, or registry APIs.

JSON is used instead of YAML because the build can rely on the Node.js standard library and contributors can opt into the checked-in JSON Schema in their editor.

## Generated-file policy

Plugin submission pull requests must not change generated artifacts. Maintainers refresh those artifacts in a separate repository-maintenance change after accepting source entries.

Generated artifacts remain committed for three reasons: GitHub can display the Awesome lists without a build, external consumers can inspect the registry at a known path, and deployments do not need a runtime dependency on another catalog host.

## Runtime data flow

The Cloudflare D1 catalog is the runtime source of truth. A scheduled Worker Cron task discovers and
validates repositories carrying the `dsh-plugin` GitHub topic. Checked-in PR entries are synced
into the same database as a secondary source and take precedence only for curated display
metadata. See [Cloudflare plugin discovery](plugin-discovery.md) for the data model, schedules,
quota controls, and operations runbook.

KV stores the derived API snapshot. The generated registry remains bundled into the Worker as
the disaster-recovery fallback and the import source for checked-in PR metadata. This preserves
the stable public artifact and keeps the website available if D1 or GitHub is temporarily
unavailable.

Live presence has a different consistency model, so it stays in the `LiveStats` Durable Object. Catalog changes never migrate or lock the live counter.

## Growth rules

A shared package should only be introduced when at least two applications need the same runtime
code. D1 owns automatically discovered runtime records; source-controlled entries continue to
own human-reviewed metadata and remain independently auditable through pull requests.
