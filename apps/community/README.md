# 1024 广场 · the DSH developer community

A second front-end, served from `/community` by the same Worker as the catalog,
against the same D1.

Text posts, one level of comments, likes, and plugin cards. Sign-in is GitHub,
and only GitHub. Black theme, no dark mode.

## Local development

Two servers: the site (which owns the whole API) and this front-end.

```bash
npm run db:migrate:local                      # from the repository root
node apps/community/scripts/seed-local.mjs
npm run dev                                   # site + API on 5641
npm run dev:community                         # this app on 5642/community
```

Open **http://127.0.0.1:5642/community/**. The dev server proxies `/api` to 5641,
and cookies are not isolated by port, so one sign-in covers both.

`apps/web/.dev.vars` sets `COMMUNITY_DEV_LOGIN=1`, which turns the sign-in button
into a local shortcut that mints a session without GitHub. It is gated on that
flag **and** a loopback hostname, and the flag is absent from `wrangler.jsonc`,
which `wrangler deploy` is the only thing that reads. To exercise the real chain
instead, unset it and configure the OAuth secrets — the app's callback is
registered against port 5641.

```bash
npm run test --workspace @dsh-1024store/community
npm run test:visual --workspace @dsh-1024store/community   # needs both servers
```

## Shape of the thing

| Path | What it holds |
| --- | --- |
| `src/` | The React app. `base`/`basename` is `/community/` in dev and production alike |
| `worker/app.ts` | `registerCommunityRoutes` — mounted onto the site's Hono app |
| `worker/serve.ts` | Which requests are the community's, and how its shell is served |
| `worker/share-metadata.ts` | Per-post `<title>` and share tags |
| `worker/lib/posts.ts` | Every D1 read and write, and the hot-feed ranking |
| `worker/lib/post-body.ts` | Body validation and plugin-mention extraction |
| `worker/lib/contract.ts` | Wire types, imported by both the Worker and the browser |
| `src/theme.css` | The black theme, as overrides on the shared design tokens |

Schema lives in `apps/web/migrations/0007_community.sql` — one database, one
migration sequence.

## Decisions worth knowing before you change something

**It is not a separate service.** Its routes are registered onto the site's app
and its bundle is built into the site's asset directory. That is deliberate: a
GitHub OAuth App accepts one callback URL, so a second origin would have meant
either a second OAuth app or a `Domain`-scoped session cookie shared across
subdomains. Same origin costs nothing and removes both.

**`/community/*` must be carved out before the SPA fallback.** The site's
`not_found_handling` is `single-page-application`, so any unknown path returns the
*catalog's* `index.html`. Without the carve-out a community permalink boots the
wrong app and returns 200 doing it.

**The community build runs after the site build**, into
`apps/web/dist/client/community`. Reverse the order and the deploy ships without
a community.

**Posts and comments are one table.** `reply_to_id` distinguishes them. Body
validation, rate limiting, deletion, and mention extraction are identical for
both, and one likes table then covers both.

**Deleting keeps the row.** A deleted post disappears from every list; its
permalink survives as a placeholder so the replies under it — other people's
writing — stay readable. A deleted reply goes entirely, since nothing hangs off
it. This is an implementation detail; the rules page does not describe it.

**Hot ranking happens in the Worker, not in SQL.** A week's candidates are ranked
in memory by `hotScore`. Retuning it is an edit to one function rather than a
migration.

**The feed pages on `id`, not on `created_at`.** Ids are monotonic, so they are
both time order and a unique cursor; a timestamp cursor repeats or skips rows when
two posts share a millisecond.

**Plugin mentions are resolved at write time**, against `catalog_plugins`. Only a
plugin the catalog publishes gets a card; anything else stays plain text rather
than becoming a card that leads to a 404. The published predicate appears in
`knownPluginIds` (`worker/app.ts`) and `loadPluginRefs` (`worker/lib/posts.ts`) and
they must agree.

**`loadPluginRefs` chunks its `IN` list at 90.** D1 rejects a query with more than
100 bound parameters, and the hot feed hydrates up to 300 posts. Tests run against
`node:sqlite`, whose limit is 32766, so nothing here can catch a regression —
keep the chunking.

**The share-metadata substitution is a function, not a string.**
`String.replace` interprets `$&`, `` $` ``, `$'` and `$n` in a string
replacement, and that replacement carries post text.

**Markdown never renders raw HTML.** `react-markdown` without `rehype-raw`,
deliberately: every post is written by an anonymous visitor, so there must be no
path from their text to markup. Links get `rel="nofollow ugc noreferrer"`.

**Colours come from tokens.** `@dsh-1024store/core/tokens.css` defines them and
`src/theme.css` overrides the brand layer to black. There are no literal colour
values in `src/`. Delete `theme.css` and its import to go back to the site's blue.

## Deploying

Nothing community-specific. The site's build includes it and the site's deploy
ships it:

```bash
npm run db:migrate:remote        # from the repository root, after a D1 backup
npm run deploy
```
