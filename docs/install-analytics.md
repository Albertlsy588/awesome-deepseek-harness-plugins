# Install analytics

DSH 1024Store counts installs reported through two channels, distinguished by
the event's `sourceChannel` field:

- `dsh-1024store-cli` — the open-source wrapper CLI (`npx @dsh-1024store/cli`);
- `dsh-1024store-plugin` — the in-DSH marketplace plugin
  (`packages/dsh-1024store`), which installs plugins from the DSH settings page.

The wrapper CLI delegates package management to the official DeepSeek Harness
CLI and only reports an event after checking the profile state on disk.

```text
npx @dsh-1024store/cli add owner/repository[/sub/dir] --profile web
        |
        +-- official @deepseek-ai/dsh plugin command
        +-- before/after profile verification
        +-- local retry queue
        |
        v
POST /api/v1/install-events
        |
        +-- HMAC(clientId) and discard the raw identifier
        +-- idempotent D1 event ledger
        +-- per-installation-instance state
        +-- hourly public aggregates
```

## Counting model

Without account login, the service cannot honestly identify a human being. A
"unique installer" therefore means one anonymous installation instance: a
random UUID stored under `$DSH_HOME/.dsh-1024store/`. The same person on two
machines is counted twice, while two people sharing the same `DSH_HOME` are
counted once. Public pages use the label **anonymous install instances** so the
metric is not confused with registered users.

The following measures have distinct meanings:

- **Install operations**: successful `install` and `reinstall` events.
- **First installs**: the first verified successful install for a
  client/plugin/profile tuple.
- **Anonymous install instances**: distinct client hashes that have completed
  at least one successful install.
- **Reinstalls, updates, removals, and failures**: separate operation counters;
  they are never folded into the unique-installer number.
- **24h/7d/30d installs**: successful install operations received by the server
  in each rolling window.

Client timestamps are retained for diagnostics, but public windows and the
canonical event time use the Worker receive time. This avoids clock skew and
client-controlled ranking timestamps.

Two counting-policy notes:

- **No catalog-membership gate.** A well-formed event is recorded even when its
  plugin is not (yet) in the published catalog. The former 404 "Unknown plugin"
  rejection was removed so installs that race catalog sync or target
  just-published repositories are not silently dropped; format validation, rate
  limits, and idempotency still apply.
- **CI runs are currently counted.** Every event carries an `is_ci` flag. At
  this stage CI-flagged events are included in public aggregates; the flag is
  stored per event so the counting policy can be tightened later without losing
  historical data.

## Collected fields

Each event contains an idempotency UUID, the anonymous client UUID, the canonical
plugin ID (`owner/repository`, optionally extended with the monorepo subdirectory
path, e.g. `owner/repository/packages/foo` — root and subdirectory installs of the
same repository aggregate separately, keyed by full id), profile name, the
reporting source channel
(`dsh-1024store-cli` or `dsh-1024store-plugin`), operation and result, client
start and completion times, duration, requested ref, before/after version when
available, wrapper and DSH versions, platform, architecture, CI flag, and a
bounded error code.

Arguments passed through to the official CLI are deliberately excluded from
the event and from local receipts.

Local identity, queue, and receipt updates are atomic and serialized across
CLI processes. Uploads happen outside the file lock, then remove only event IDs
the server accepted or permanently rejected, so an install enqueued during an
in-flight upload is retained.

The CLI does **not** send command output, file paths, usernames, environment
variables, source files, session contents, prompts, raw errors, IP addresses,
or a host-derived User-Agent. Requests use the fixed identifier
`@dsh-1024store/cli`. The Worker HMACs the client UUID with
`INSTALL_CLIENT_HASH_SECRET` and never writes the raw UUID to D1. Cloudflare may
still process ordinary connection metadata as the hosting provider.

Telemetry is enabled by default with a first-run notice. It can be disabled
before execution with either `DO_NOT_TRACK=1` or
`DSH_1024STORE_TELEMETRY=0`, or persistently with:

```bash
npx @dsh-1024store/cli telemetry disable
```

Use `telemetry status` to inspect the local setting, `telemetry enable` to opt
back in, and `telemetry reset` to rotate the local anonymous identifier and
clear unsent events without changing the enabled/disabled preference.
Persistently disabling telemetry also clears unsent events. Resetting does not
rewrite historical aggregate data.

## Storage

The existing `CATALOG_DB` D1 database also contains install analytics:

- `installation_events` is the immutable, idempotent event ledger.
- `plugin_client_state` records first/last activity and operation counters for
  one anonymous client/plugin/profile tuple.
- `plugin_hourly_stats` contains ranking-ready hourly rollups.
- `plugin_hourly_clients` deduplicates anonymous instances within an hour.

The public API only returns aggregate values. No endpoint exposes client hashes
or individual event rows.

### Operator queries

Maintainers can inspect per-instance counters and exact server receive times
directly in D1 without adding a public raw-data endpoint:

```bash
cd apps/web
npx wrangler d1 execute dsh-store-star-history --remote --command \
  "SELECT substr(client_hash, 1, 16) AS install_instance, plugin_id, profile, first_installed_at, last_installed_at, install_count, reinstall_count, update_count, remove_count, failure_count, current_state FROM plugin_client_state ORDER BY last_seen_at DESC LIMIT 100"

npx wrangler d1 execute dsh-store-star-history --remote --command \
  "SELECT event_id, substr(client_hash, 1, 16) AS install_instance, operation, status, server_received_at, duration_ms, before_version, after_version, error_code FROM installation_events WHERE plugin_id = 'owner/repository' ORDER BY server_received_at DESC LIMIT 200"
# plugin_id may also be a monorepo subdirectory id, e.g. 'owner/repository/packages/foo'
```

The shortened hash in these reports is only an operator-facing display label;
the primary tables retain the full HMAC for correct deduplication.

## Deployment

Publish the wrapper package after verifying its exact tarball contents:

```bash
npm run test:cli
npm run pack:cli
npm publish --workspace @dsh-1024store/cli --access public
```

The `@dsh-1024store` npm organization must exist and the publisher must have access
to it. Do not switch the website to another package name without updating the
CLI package, UI command builder, tests, and this document together.

Apply D1 migrations and set a high-entropy Worker secret before deploying:

```bash
cd apps/web
npx wrangler d1 migrations apply dsh-store-star-history --remote
openssl rand -hex 32 | npx wrangler secret put INSTALL_CLIENT_HASH_SECRET
cd ../..
npm run build
npm run deploy
```

The existing Cloudflare Worker name `dsh-store` and D1 database name
`dsh-store-star-history` are legacy infrastructure identifiers retained to
preserve the deployed resources and their data. They are not the public brand
or CLI package name.

Use a different secret per environment and keep it stable. Rotating it changes
the hash of future client IDs, so existing anonymous instances would be counted
as new instances.

The CLI endpoint defaults to
`https://deepseek1024.com/api/v1/install-events`. For local testing only, set
`DSH_1024STORE_TELEMETRY_URL` to a different full endpoint URL.

## Trust boundary and abuse

The wrapper, event contract, and ingestion code are public. As with npm download
counts or any unauthenticated CLI telemetry, a determined attacker can forge
requests. Event UUID idempotency, strict validation, bounded payloads,
strictly validated plugin IDs (per-segment character checks with bounded
length, including monorepo subdirectory ids), and per-instance aggregation
prevent accidental inflation, but they are not proof of a real human install. Treat the metric as a
useful ecosystem signal, not a billing, payout, or security primitive.
