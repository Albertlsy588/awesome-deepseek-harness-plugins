# Catalog provenance

The initial catalog was imported on 2026-08-14 from the public-domain [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) registry at commit `6b92067d43d32d4a40848752d06f56cfe3fb56fd`.

That project publishes its catalog under CC0-1.0. This repository retains the provenance record even though attribution is not required by the license. Subsequent changes are maintained in `catalog/plugins/*.json`; the reference project is not queried by the application at runtime.

The initial import included only catalog data. The per-plugin JSON source format, local schema, deterministic projections, contribution workflow, and automated review are this repository's own contracts; they are not inherited from the reference project's README-based submission format.

## Incremental synchronization

On 2026-08-14, 74 additional repository-level entries and the Skills category
were synchronized from upstream commit
`8ad088514c98f922bfb6b6a80604defe3ff7f904`. Nine upstream entries that point
to package subdirectories inside monorepositories were not imported because
this catalog identifies each plugin by a unique GitHub `owner/repository`.
