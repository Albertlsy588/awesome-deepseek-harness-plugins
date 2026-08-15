# Contributing

## Add a plugin

Catalog entries are maintained as one JSON file per repository in `catalog/plugins/`. Every community pull request must add exactly one new source entry and contain no unrelated changes. Updates, removals, workflow changes, and application changes are maintainer operations and use the repository's explicit emergency bypass path.

1. Confirm a `package.json` in the repository declares a non-empty `dsh.bundle.patch` and that the referenced patch file is committed. Monorepo subpackages are supported.
2. Test the plugin yourself. Catalog review does not install, build, or execute third-party code; authors remain responsible for runtime compatibility.
3. Add the `dsh-plugin` GitHub topic so tokenless metric discovery can find it.
4. Copy an existing plugin JSON file and name it `<owner>--<repository>.json` in lowercase, with non-alphanumeric runs converted to `-`.
5. Keep both descriptions factual, neutral, and specific. Avoid superlatives, calls to action, and unsupported claims.
6. Set `added` to the submission date.
7. Commit only that one new `catalog/plugins/*.json` file. Do not change README files, workflows, application code, or any other path in the same pull request. `README.md` and `catalog/README.md` are bot-generated projections and are refreshed automatically.

Example:

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

The catalog derives `owner` and the install command from `id`, which prevents duplicated fields from drifting.

Every pull request receives one deliberately narrow static gate. The workflow rejects any change other than one new source entry, validates its exact fields, filename, category, descriptions, and date, then reads the target repository through the GitHub API. It finds a root or nested `package.json` with `dsh.bundle.patch` and confirms that the patch path exists in the same revision. It does not install dependencies, run lifecycle scripts, parse the patch, build the project, or assess plugin behavior.

The trusted workflow comments on the pull request with the exact failure reason. A non-draft pull request that passes `Plugin submission review / static-review` is squash-merged automatically. Draft pull requests are validated but remain open until marked ready for review.

After the merge everything is automated — there is no maintainer step. The catalog-sync workflow pushes all `catalog/plugins/*.json` entries to the website's `POST /api/v1/catalog/sync` endpoint, so the plugin is synced automatically into the production D1 catalog, and then rebuilds `README.md` and `catalog/README.md` from the live catalog API, committing any changes as `github-actions[bot]`. Your plugin appears on [deepseek1024.com](https://deepseek1024.com/) and in both README directories without further action. See [docs/api.md](docs/api.md) for the endpoint contract.

Repository owners must protect `main` in GitHub Rules or branch protection:

1. Require changes to be made through a pull request, without requiring an approving review.
2. Require only `Plugin submission review / static-review` before merging.
3. Block force pushes and branch deletion, and leave the ruleset bypass list empty except for two explicit entries: an emergency maintainer account used for trusted maintenance changes, and the GitHub Actions app (an Integration-type bypass actor). The Actions bypass is required because the catalog-sync workflow commits the regenerated `README.md` / `catalog/README.md` directly to `main` as `github-actions[bot]`; without it the automated README refresh is rejected by the pull-request rule.

The workflow runs trusted code from the pull request's base revision and treats the submitted checkout only as data. The review job can read repository contents and update its pull request review comment. Only after that job succeeds, a separate merge job receives write permission and squash-merges the exact reviewed head SHA. A newer push makes the old run stale and prevents it from merging.

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
