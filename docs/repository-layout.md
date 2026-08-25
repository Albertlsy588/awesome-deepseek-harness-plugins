# Repository layout

## Decision

This repository holds the **plugin catalog only**: the awesome list, the plugin submission
review/merge workflow, and the generated README directories. The DSH 1024Store
**application** — the deepseek1024.com site + Worker (`web`) and the publishable
`dsh1024` npm package (`plugin`) — was split out to
[imsai-sh/dsh-1024store](https://github.com/imsai-sh/dsh-1024store) on 2026-08-25 so each
repository has one clear responsibility.

## Directory responsibilities

| Path | Responsibility | Generated? |
| --- | --- | --- |
| `catalog/plugins/*.json` | One curated entry per plugin; the submission form of record | No — contributed via PR |
| `catalog/categories.json` | Category definitions: ids, order, bilingual labels (source of truth; pushed to the Worker as data by catalog-sync) | No |
| `catalog/schema/plugin.schema.json` | The JSON Schema submissions validate against | No |
| `catalog/README.md` | English directory projection | Yes — `npm run readme:build` |
| `README.md` | Chinese directory projection | Yes — `npm run readme:build` |
| `scripts/` | Review gate, merge, catalog sync, README generation, homepage capture | No |
| `skills/submit-dsh-plugin/` | The guided submission skill; must track the live spec | No |
| `docs/` | Catalog data-model docs, permanent-URL stubs, and historical plans | No |
| `docs/assets/` | README-referenced assets — `wechat-group.jpg` is embedded by the generated `README.md`; deleting it 404s the QR | No |
| `.github/workflows/` | plugin-review (PR gate + auto-merge), catalog-sync (D1 sync + README refresh), CI (script tests) | No |

## Single sources of truth

| Data | Source of truth |
| --- | --- |
| Curated plugin entries | `catalog/plugins/*.json` here |
| Category definitions | `catalog/categories.json` here (synced into production D1 by this repo's catalog-sync workflow) |
| Live catalog | Production D1, fed by this repo's catalog-sync workflow plus the maintainer's out-of-band collection jobs |
| Directory READMEs | Generated from the live catalog API — never hand-edited |
| Site, API, CLI code | [imsai-sh/dsh-1024store](https://github.com/imsai-sh/dsh-1024store) |

## Growth rules

- New automation belongs in `scripts/` with a sibling `*.test.mjs`; the scripts stay
  dependency-free (node builtins only) so the repo needs no dependency install to review.
- Anything that serves HTTP, stores data, or ships to users belongs in dsh-1024store, not
  here.
- Cross-repo invariants are listed in [AGENTS.md](../AGENTS.md); update both repositories
  in coordinated changes.
