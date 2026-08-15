# Automatic plugin submission merge

## Goal

Treat every public pull request as a plugin catalog submission. A pull request is eligible only when it adds exactly one regular `catalog/plugins/*.json` file and changes nothing else. Eligible non-draft pull requests are squash-merged automatically after trusted static validation. Every other pull request fails the same gate; maintainers use the explicit emergency ruleset bypass for trusted repository maintenance.

## Workflow

`Plugin submission review` runs on `pull_request_target` for pull requests targeting `main`. Its `static-review` job checks out the base revision as trusted executable code and the contributor head as data with credentials disabled. The trusted reviewer validates the complete GitHub file list, the entry schema and filename, the target repository's `dsh.bundle.patch`, and the referenced patch path. It never installs, builds, or executes contributor or third-party plugin code.

After `static-review` succeeds, a separate `merge` job receives `contents: write` and `pull-requests: write`. It reloads the pull request, requires an open pull request targeting `main`, compares the current head with the exact SHA carried by the validated event, and sends a squash merge request containing that expected SHA. A concurrent newer push cancels the older run; the SHA comparison and GitHub merge API provide a second atomic stale-run guard. Draft pull requests stop after validation until `ready_for_review` retriggers the workflow.

The general CI workflow runs only on pushes to `main`, so fork pull request code never consumes the repository's CI runner.

## Repository rules

Protect `main` by requiring pull requests and the single `Plugin submission review / static-review` status check. Do not require an approving review or `CI / verify`, because both would block the trusted merge job. Keep force pushes and branch deletion blocked. Keep only a deliberate emergency maintainer bypass for non-catalog maintenance.

## Verification

Tests cover the one-file policy, ordinary-PR rejection, symlink rejection, merge input validation, wrong-base rejection, stale workflow handling, idempotent already-merged behavior, repository-rule failures, documentation consistency, and workflow trigger contracts. Run `actionlint`, `npm run cf-typecheck`, `npm run typecheck`, `npm test`, `npm run build`, and `npm audit --omit=dev` before publishing the maintenance change.
