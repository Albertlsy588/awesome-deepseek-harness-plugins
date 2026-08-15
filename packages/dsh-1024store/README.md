# dsh-1024store

[中文](README.zh.md) | English

The in-app 1024 Store browser and installer for the curated [1024 catalog](https://deepseek1024.com/). It appears both as a dedicated **1024 Store** entry in Settings and as a **1024 Store (count)** tab under **Settings → Plugins**.

The plugin queries the live `/api/plugin` catalog, checks its own version automatically, and supports catalog search, category filters, installed-state detection, confirmed installs, uninstall, and operation progress. Plugin changes take effect after restarting DeepSeek Harness.

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
