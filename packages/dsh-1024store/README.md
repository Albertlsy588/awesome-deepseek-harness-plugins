# dsh-1024store

[中文](README.zh.md) | English

The in-app 1024 Store browser and installer for [the DSH 1024Store plugin hub for DeepSeek Harness](https://deepseek1024.com/). It appears both as a dedicated **1024 Store** entry in Settings and as a **1024 Store (count)** tab under **Settings → Plugins**.

The plugin queries the live `/api/v1/registry` catalog, checks its own version automatically, and supports catalog search, category filters, installed-state detection, confirmed installs, uninstall, and operation progress. Plugin changes take effect after restarting DeepSeek Harness.

## Install

```sh
dsh plugin --profile web add dsh-1024store
```

Restart DeepSeek Harness after installation.

## Local development

From the repository root:

```sh
npm install
npm run market:test
```

Install the built package into an isolated profile:

```sh
DSH_HOME=/tmp/dsh-store-test dsh plugin --profile market-test add ./packages/dsh-1024store
DSH_HOME=/tmp/dsh-store-test dsh --profile market-test --port 14567
```

The installer only accepts repository URLs present in the validated 1024 Store registry. It derives `github:owner/repository` itself instead of executing the registry's display command. Mutating routes require same-origin POST requests and serialize plugin operations.

## Anonymous install telemetry

After each install or uninstall the plugin reports one anonymous outcome event (`sourceChannel: dsh-1024store-plugin`) to the same public endpoint as the CLI, reusing the CLI's shared anonymous identity in `$DSH_HOME/.dsh-1024store/client.json`. Reporting is fire-and-forget, silent on failure, and fully disabled by `DO_NOT_TRACK=1`, `DSH_1024STORE_TELEMETRY=0`, or `npx @dsh-1024store/cli telemetry disable` (no identity is created when opted out). Details: [docs/install-analytics.md](../../docs/install-analytics.md).
