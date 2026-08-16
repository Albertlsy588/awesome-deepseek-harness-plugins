# Contributing

## Add a plugin

Catalog entries are maintained as one JSON file per plugin in `catalog/plugins/`. A plugin is identified by its `id`: either `owner/repository` for a repository-level plugin, or `owner/repository/sub/dir` for a monorepo subpackage, so one repository may contribute several entries as long as every `id` is unique. Every community pull request must add exactly one new source entry and contain no unrelated changes. Updates, removals, workflow changes, and application changes are maintainer operations and use the repository's explicit emergency bypass path.

1. Confirm the plugin's `package.json` declares a non-empty `dsh.bundle.patch` and that the referenced patch file is committed. Confirm the plugin is installable **from GitHub**, not only from npm: a git install runs `prepare` and otherwise ships only committed files, so either the declared entry point (`exports["."]` or `main`) is committed, or a self-contained `prepare` script builds it on install. A plugin whose entry point is a build artifact produced at npm-publish time installs cleanly and then fails at profile boot with a module-not-found error. For a repository-level `id` the manifest may live at the root or in any nested directory; for a subdirectory `id` the manifest must be located exactly at `<sub/dir>/package.json`, because the id's path becomes the `github:owner/repository#path:sub/dir` install spec.
2. Test the plugin yourself. Catalog review does not install, build, or execute third-party code; authors remain responsible for runtime compatibility.
3. Add the `dsh-plugin` GitHub topic so tokenless metric discovery can find it.
4. Copy an existing plugin JSON file and name it after the id: each `/`-separated id segment is lowercased with non-alphanumeric runs converted to `-`, and the segments are joined with `--`, e.g. `owner/repository` → `owner--repository.json` and `owner/repository/packages/foo` → `owner--repository--packages--foo.json`. Files stay flat in `catalog/plugins/`.
5. Keep both descriptions factual, neutral, and specific. Avoid superlatives, calls to action, and unsupported claims.
6. Set `added` to the submission date.
7. Commit only that one new `catalog/plugins/*.json` file. Do not change README files, workflows, application code, or any other path in the same pull request. `README.md` and `catalog/README.md` are bot-generated projections and are refreshed automatically.

Example (repository-level plugin):

```json
{
  "$schema": "../schema/plugin.schema.json",
  "id": "owner/repository",
  "name": "repository",
  "repository": "https://github.com/owner/repository",
  "category": "tools",
  "description": {
    "en": "A concise English description.",
    "zh": "简洁、客观的中文说明。"
  },
  "added": "2026-08-14"
}
```

Example (monorepo subpackage): the `id` carries the in-repo path, `repository` stays the repository-root URL, and `name` conventionally uses the subpackage name (the last id segment by default):

```json
{
  "$schema": "../schema/plugin.schema.json",
  "id": "owner/repository/packages/foo",
  "name": "foo",
  "repository": "https://github.com/owner/repository",
  "category": "tools",
  "description": {
    "en": "A concise English description.",
    "zh": "简洁、客观的中文说明。"
  },
  "added": "2026-08-16"
}
```

The catalog derives `owner` and the install command from `id`, which prevents duplicated fields from drifting: a two-segment id installs as `github:owner/repository`, and a subdirectory id installs as `github:owner/repository#path:sub/dir`. Id path segments may not be `.` or `..`.

Every pull request receives one deliberately narrow static gate. The workflow rejects any change other than one new source entry, validates its exact fields, filename, category, descriptions, and date, then reads the target repository through the GitHub API. For a two-segment id it finds a root or nested `package.json` with `dsh.bundle.patch`; for a subdirectory id it requires that manifest exactly at the id's path. In both cases it confirms that the patch path exists in the same revision, and that a git install would have a loadable entry point (a committed entry file, or a `prepare` script that builds one). It does not install dependencies, run lifecycle scripts, parse the patch, build the project, or assess plugin behavior.

The trusted workflow comments on the pull request with the exact failure reason. A failed review leaves the pull request open so the author can push a correction. A non-draft pull request that passes `Plugin submission review / static-review` is squash-merged automatically; GitHub then records it as merged (and therefore no longer open). Draft pull requests are validated but remain open until marked ready for review.

After the merge everything is automated — there is no maintainer step. The catalog-sync workflow pushes all `catalog/plugins/*.json` entries to the website's `POST /api/v1/catalog/sync` endpoint, so the plugin is synced automatically into the production D1 catalog, and then rebuilds `README.md` and `catalog/README.md` from the live catalog API, committing any changes as `github-actions[bot]`. Your plugin appears on [deepseek1024.com](https://deepseek1024.com/) and in both README directories without further action. See [docs/api.md](docs/api.md) for the endpoint contract.

Repository owners must protect `main` in GitHub Rules or branch protection:

1. Require changes to be made through a pull request, without requiring an approving review.
2. Require only `Plugin submission review / static-review` before merging.
3. Block force pushes and branch deletion, and leave the ruleset bypass list empty except for two explicit entries: an emergency maintainer account used for trusted maintenance changes, and deploy keys. The deploy-key bypass is required because the catalog-sync workflow pushes the regenerated `README.md` / `catalog/README.md` directly to `main` over SSH, authenticated by a write deploy key stored as the `CATALOG_DEPLOY_KEY` repository secret (personal-account rulesets cannot list the GitHub Actions app as a bypass actor); without it the automated README refresh is rejected by the pull-request rule.

The workflow runs trusted code from the pull request's base revision and treats the submitted checkout only as data. GitHub Actions requires pull-request write permission for PR issue comments, but the trusted review script only calls comment endpoints and never updates pull request state. Only after that job succeeds, a separate merge job receives the minimum write permissions needed to squash-merge the exact reviewed head SHA and dispatch catalog sync; it does not receive general pull-request write permission. A newer push makes the old run stale and prevents it from merging.

The general CI workflow runs only after a push reaches `main`; fork pull request code is never installed, built, or executed.

Catalog metadata contributions are provided under CC0-1.0. Code contributions are provided under MIT.

## Maintainer changes

Non-catalog changes are rejected by the public pull request gate. Maintainers use the explicit emergency ruleset bypass for trusted repository maintenance, including updates, removals, workflows, and the Web application.

1. Create a focused maintenance branch from `main`.
2. Run `npm run cf-typecheck`, `npm run typecheck`, `npm test`, and `npm run build`.
3. Run `npm run test:visual` and attach screenshots for visible UI changes.
4. Review the complete diff, then use the emergency bypass deliberately when merging the maintenance pull request.
5. Avoid unrelated formatting churn, and never hand-edit the bot-generated `README.md` or `catalog/README.md`; run `npm run readme:build` instead.

Never commit `.dev.vars`, GitHub tokens, Cloudflare credentials, or other secrets.
