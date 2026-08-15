# dsh1024

`dsh1024` is DSH 1024Store's thin, verifiable wrapper around the official
DeepSeek Harness plugin command. It installs a catalog plugin, checks that the
selected DSH profile really contains it, and submits an anonymous installation
outcome to the DSH 1024Store statistics API.

## Usage

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

The client UUID belongs to this DSH home, not to a person or account. A person
using multiple DSH homes is counted as multiple anonymous installations; users
sharing one DSH home share one anonymous installation identity.

The CLI does **not** submit IP addresses, stderr/stdout, commands, filesystem
paths, usernames, environment values, session content, prompts, or API keys.
The service may see ordinary HTTP connection metadata while receiving a POST;
the event body contains only the documented fields above.

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

`dsh1024` replaces the deprecated `@dsh-1024store/cli` npm package. Replace
`npx @dsh-1024store/cli ...` with `npx dsh1024 ...`; every command, option, and
pass-through behavior is unchanged. Existing telemetry preferences, the
anonymous identity, and local receipts are stored under
`$DSH_HOME/.dsh-1024store/` and are reused as-is, so no migration step is
needed and no environment variable has to be renamed.

## Development

```sh
npm test
npm run pack:check
```
