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
| `skills/` | Installable Agent Skills for contributor workflows | Yes |
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

The generated registry is bundled into the Worker. This removes a runtime dependency on another catalog host and ensures that application code and catalog schema deploy together.

The deployment artifact contains curated metadata only. The generator assigns it a SHA-256 content revision, and the Worker rejects KV snapshots from any other revision. A scheduled Worker enriches all repositories with GitHub stars, forks, latest release, and recent activity, then replaces the KV snapshot. API requests use the compatible snapshot and refresh stale data in the background.

Live presence has a different consistency model, so it stays in the `LiveStats` Durable Object. Catalog changes never migrate or lock the live counter.

## Growth rules

A shared package should only be introduced when at least two applications need the same runtime code. A database should only replace source-controlled entries when moderation or write volume can no longer be handled through pull requests. Until either threshold is reached, the current layout keeps deployment and contribution mechanics visible and small.
