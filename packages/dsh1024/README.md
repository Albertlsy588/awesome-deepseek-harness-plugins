# dsh1024

[中文](README.zh.md) | English

`dsh1024` is the DSH 1024Store package for DeepSeek Harness. One npm package
provides two entry points:

- **In-app 1024 Store plugin** — browse and install the curated
  [1024 catalog](https://deepseek1024.com/) from inside DeepSeek Harness. It
  appears both as a dedicated **1024 Store** entry in Settings and as a
  **1024 Store (count)** tab under **Settings → Plugins**.
- **Tracked installer CLI** — a thin, verifiable wrapper around the official
  DeepSeek Harness plugin command. It installs a catalog plugin, checks that
  the selected DSH profile really contains it, and submits an anonymous
  installation outcome to the DSH 1024Store statistics API.

## Install the in-app store

```sh
npx dsh1024 store
```

This runs `npx @deepseek-ai/dsh plugin --profile web add dsh1024` through the
official CLI and counts the install anonymously. Installing directly with the
official CLI works the same way:

```sh
npx @deepseek-ai/dsh plugin --profile web add dsh1024
```

Restart DeepSeek Harness after installation.

The in-app store queries the live `/api/v1/registry` catalog, checks its own
version automatically, and supports catalog search, category filters,
installed-state detection, confirmed installs, uninstall, and operation
progress. The installer only accepts repository URLs present in the validated
1024 Store registry. It derives `github:owner/repository` itself instead of
executing the registry's display command. Mutating routes require same-origin
POST requests and serialize plugin operations. Plugin changes take effect after
restarting DeepSeek Harness.

## CLI usage

Node.js 22 or newer is required.

```sh
npx dsh1024 add omdsh-dev/dsh-deep-research --profile web
```

The wrapper executes this command without a shell:

```sh
npx --yes @deepseek-ai/dsh plugin --profile web add github:omdsh-dev/dsh-deep-research
```

`web` is the default profile. A Git ref is optional:

```sh
npx dsh1024 add owner/repository#v1.2.0
```

### Official CLI argument pass-through

The wrapper consumes only the tracked `owner/repository`, the shared
`--profile`/`-p` option, and the first `--` separator. Every other argument is
appended unchanged to the official plugin command. Put the tracked repository
first, and use `--` when an official argument could otherwise look like a
wrapper option:

```sh
npx dsh1024 add owner/repository --profile web -- \
  --ignore-scripts --reporter append-only --config.confirmModulesPurge=false
```

This executes, without a shell:

```sh
npx --yes @deepseek-ai/dsh plugin --profile web add \
  github:owner/repository --ignore-scripts --reporter append-only \
  --config.confirmModulesPurge=false
```

The separator itself is consumed; tokens after it are not parsed at all. To
pass a literal `--`, write `-- --`. Pass-through arguments never enter the
telemetry event or local receipt.

## What is recorded

Each enabled attempt submits one event containing a random event UUID, a stable
random client UUID, plugin ID, DSH profile, install/reinstall result, client
timestamps and duration, before/after version when detectable, requested ref,
CLI/DSH versions when detectable, OS, CPU architecture, CI boolean, and a short
error code. The server receive time is added by the API.

After each install or uninstall performed inside the in-app store, the plugin
reports one anonymous outcome event of the same shape
(`sourceChannel: dsh-1024store-plugin`) to the same public endpoint as the CLI,
reusing the CLI's shared anonymous identity. Reporting is fire-and-forget and
silent on failure.

The client UUID belongs to this DSH home, not to a person or account. A person
using multiple DSH homes is counted as multiple anonymous installations; users
sharing one DSH home share one anonymous installation identity.

The package does **not** submit IP addresses, stderr/stdout, commands,
filesystem paths, usernames, environment values, session content, prompts, or
API keys. The service may see ordinary HTTP connection metadata while receiving
a POST; the event body contains only the documented fields above.

The identity is stored at `$DSH_HOME/.dsh-1024store/client.json` (default
`~/.dsh`). Installed package names and resolved versions stay in the local
`receipts.json` file and are not uploaded. Pending events stay in
`pending.json`, use idempotent event UUIDs, and are retried on the next install.
The queue keeps at most 1000 recent events. Network, rate-limit, and server
failures are retried; events permanently rejected as invalid are skipped so
they cannot block newer events. An upload failure never changes the plugin
install exit code. Client identity, queue, and receipt updates use short-lived
cross-process locks so concurrent installs sharing one `DSH_HOME` do not
overwrite each other; network requests run outside those locks.

Details: [docs/install-analytics.md](../../docs/install-analytics.md).

## Controls

```sh
npx dsh1024 telemetry status
npx dsh1024 telemetry disable
npx dsh1024 telemetry enable
npx dsh1024 telemetry reset
```

`reset` rotates the local anonymous identity and clears the pending queue while
preserving the enabled or disabled preference; it does not uninstall plugins.
Persistently disabling telemetry also clears unsent events. Telemetry is also
disabled for a process when either
`DO_NOT_TRACK=1` or `DSH1024_TELEMETRY=0` is set.

## Configuration

- `DSH_HOME`: DSH data directory (default `~/.dsh`).
- `DSH1024_TELEMETRY`: set to `0` to disable telemetry for a process.
- `DSH1024_DSH_PACKAGE`: official CLI package spec (default
  `@deepseek-ai/dsh`; useful for pinning or tests).
- `DSH1024_DSH_VERSION`: explicit DSH version placed in the event when the
  package spec itself is unversioned.
- `DSH1024_TELEMETRY_URL`: complete event endpoint URL (default
  `https://deepseek1024.com/api/v1/install-events`).
- `DSH1024_TELEMETRY_TIMEOUT_MS`: upload timeout from 100 to 30000 ms
  (default 2500 ms).

The legacy `DSH_1024STORE_*` spellings of these variables (for example
`DSH_1024STORE_TELEMETRY=0`) remain supported permanently. When both spellings
are set, the `DSH1024_*` value wins.

## Migrating from the old packages

`dsh1024` replaces the deprecated `@dsh-1024store/cli` and `dsh-1024store` npm
packages. Replace `npx @dsh-1024store/cli ...` with `npx dsh1024 ...`, and
`dsh plugin --profile web add dsh-1024store` with
`dsh plugin --profile web add dsh1024`; every command, option, and
pass-through behavior is unchanged. Existing telemetry preferences, the
anonymous identity, and local receipts are stored under
`$DSH_HOME/.dsh-1024store/` and are reused as-is, so no migration step is
needed and no environment variable has to be renamed.

## Development

From the repository root:

```sh
npm install
npm run market:test
```

Install the built package into an isolated profile:

```sh
DSH_HOME=/tmp/dsh-store-test dsh plugin --profile market-test add ./packages/dsh1024
DSH_HOME=/tmp/dsh-store-test dsh --profile market-test --port 14567
```

Inside `packages/dsh1024`:

```sh
npm test
npm run pack:check
```
