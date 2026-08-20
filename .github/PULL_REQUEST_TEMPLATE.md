## Plugin

Link the submitted plugin repository and summarize its user-visible capability.

## Author verification

List the real command and result used to test plugin behavior and compatibility. The catalog workflow does not execute third-party plugin code.

## Catalog submissions

- [ ] This PR only touches `catalog/plugins/*.json` files
- [ ] New plugin: this PR adds exactly one `catalog/plugins/*.json` file, so a passing non-draft review is merged automatically
- [ ] Update or removal of existing entries: I understand the static review still runs, but a maintainer reviews and merges such a PR manually
- [ ] Repository declares `dsh.bundle.patch` and commits the referenced patch file (added or modified entries)
- [ ] Plugin behavior and compatibility were tested by the author
- [ ] `dsh-plugin` topic added
- [ ] English and Chinese descriptions are neutral and accurate
- [ ] I understand that a failed review leaves this PR open for corrections and never closes it, and that after any merge the website catalog and README directories refresh automatically

## Maintainer API compatibility

Catalog-only plugin submissions leave this section unchecked. Maintainer changes that touch
API routes, projections, parameters, defaults, status/error codes, headers, pagination,
ordering, authentication or shared API code complete it.

- [ ] This change has no API behavior impact, or its API impact is described above
- [ ] Every added or changed API route is registered in `apps/web/contracts/api-surface.json`
- [ ] Existing-version behavior remains backward compatible and historical contract fixtures were not casually rewritten
- [ ] Any breaking behavior uses a new versioned route while the previous version remains available
- [ ] `npm run test:api-contract` passes
