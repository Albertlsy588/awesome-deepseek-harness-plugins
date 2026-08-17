# 1024 广场 · the DSH developer community

A separate Worker and React app on `community.deepseek1024.com`, sharing the main site's D1.

Text posts, one level of comments, likes, and plugin cards. Sign-in is GitHub, and only GitHub.

## Local development

```bash
npm run db:migrate:local                # from the repository root, web migrations first
node apps/community/scripts/seed-local.mjs
npm run dev:community                   # http://127.0.0.1:5642
```

The dev server shares its local D1 with `apps/web` (see `persistState` in `vite.config.ts`), so a
session minted on either port works on both.

`.dev.vars` sets `COMMUNITY_DEV_LOGIN=1`, which turns the sign-in button into a local shortcut that
mints a session without GitHub. That is gated on the flag **and** a loopback hostname, and the flag
is absent from `wrangler.jsonc`, so no deploy can carry it. To exercise the real chain instead,
unset it and run the main app on port 5641 — the OAuth App's callback is registered against that
port.

`.dev.vars` shows up in `dist/dsh_community/` after a build. That is the Vite plugin staging it for
`vite preview`; it is not in the uploaded assets (`dist/client/`) and not in the deploy manifest
(`dist/dsh_community/wrangler.json`), and `wrangler deploy` does not read `.dev.vars` at all.
`apps/community/tests/deploy-config.test.ts` asserts the flag never appears in `wrangler.jsonc`.

```bash
npm run test --workspace @dsh-1024store/community
npm run test:visual --workspace @dsh-1024store/community   # needs the dev server running
```

## How sign-in works

The community runs no OAuth exchange. A GitHub OAuth App accepts one callback URL and it belongs
to the main site, so:

```
community  →  GET /api/v1/community/sign-in
           →  deepseek1024.com/api/v1/auth/github/login?returnTo=https://community.deepseek1024.com/…
           →  GitHub  →  main-site callback
           →  Set-Cookie: dsh_session=…; Domain=deepseek1024.com
           →  302 back to the community, which reads the same api_sessions row
```

The pieces that make it safe — the hardcoded return-host allow-list, and reading every
`dsh_session` value rather than the first — live in `packages/dsh-core/src/auth.ts` and are
described in the repository's `AGENTS.md`.

## Shape of the thing

| Path | What it holds |
| --- | --- |
| `worker/app.ts` | The `/api/v1/community/*` routes, rate limits, and CSRF checks |
| `worker/lib/posts.ts` | Every D1 read and write, and the hot-feed ranking |
| `worker/lib/post-body.ts` | Body validation and plugin-mention extraction |
| `worker/lib/contract.ts` | Wire types, imported by both the Worker and the browser |
| `worker/index.ts` | Assets, cache headers, and per-post share metadata |
| `src/` | The React app |
| `migrations/` | `community_*` tables only |

## Decisions worth knowing before you change something

**Posts and comments are one table.** `reply_to_id` distinguishes them. There is one level of
replies, and body validation, rate limiting, soft delete, and mention extraction are identical for
both — two tables would mean writing each of those twice, and "can you like a comment?" would need
a second likes table. The cost is `WHERE reply_to_id IS NULL` on the feed.

**Deletion is soft.** The row survives with `deleted_at` set; the reader gets `body: null` and no
plugin cards. Hard deletion would cascade away a whole discussion, and other people's replies are
not the author's to remove.

**Hot ranking happens in the Worker, not in SQL.** A week's candidates are ranked in memory by
`hotScore`. The window is small enough that this costs less than the index it would need, and it
keeps the formula out of the schema — retuning it is an edit to one function rather than a
migration.

**The feed pages on `id`, not on `created_at`.** Ids are monotonic, so they are both time order and
a unique cursor; a timestamp cursor repeats or skips rows when two posts share a millisecond.

**Plugin mentions are resolved at write time.** `@owner/name` is checked against `catalog_plugins`
when the post is created, and only a plugin the catalog actually publishes gets a row in
`community_post_plugins`. A mention of something unknown stays plain text rather than becoming a
card that leads to a 404. The published predicate appears in two places — `knownPluginIds` in
`worker/app.ts` and `loadPluginRefs` in `worker/lib/posts.ts` — and they must agree.

**Markdown never renders raw HTML.** `react-markdown` is used without `rehype-raw`, deliberately:
every post is written by an anonymous visitor, so there must be no path from their text to markup.
Do not add `rehype-raw`. Links get `rel="nofollow ugc noreferrer"`.

**No dark mode.** Colours come from `@dsh-1024store/core/tokens.css` and there are no literal
colour values anywhere in `src/`.

## Deploying

```bash
npm run db:migrate:remote        # from the repository root, after a D1 backup
npm run deploy:community
```

`wrangler.jsonc` here binds only `community.deepseek1024.com`. The main site's three hostnames are
owned by `apps/web/wrangler.jsonc`; the two lists must never overlap, and a deploy that drops an
entry unbinds that hostname.
