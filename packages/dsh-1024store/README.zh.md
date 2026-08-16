# dsh-1024store

中文 | [English](README.md)

把 [1024 Store](https://deepseek1024.com/) 精选目录装进 DeepSeek Harness。安装后既可从设置左侧的 **1024 Store** 直接进入，也可在 **设置 → 插件 → 1024 Store（插件数量）** 中打开。

插件通过 `/api/v1/registry` 动态查询目录，启动后自动检查自身版本，并支持目录搜索、分类筛选、已安装识别、安装确认、卸载和操作进度。插件变更会在重启 DeepSeek Harness 后生效。

## 安装

```sh
dsh plugin --profile web add dsh-1024store
```

安装完成后重启 DeepSeek Harness。

## 本地开发

在仓库根目录运行：

```sh
npm install
npm run market:test
```

把构建结果安装到隔离 profile：

```sh
DSH_HOME=/tmp/dsh-store-test dsh plugin --profile market-test add ./packages/dsh-1024store
DSH_HOME=/tmp/dsh-store-test dsh --profile market-test --port 14567
```

安装器只接受已通过校验且出现在 1024 Store 目录中的 GitHub 仓库 URL。它会自行生成 `github:owner/repository` 参数，不执行目录中的展示命令。所有写操作都要求同源 POST，并且同一时间只允许一个插件操作。

## 匿名安装遥测

每次安装或卸载后，插件会向与 CLI 相同的公共端点上报一条匿名结果事件（`sourceChannel: dsh-1024store-plugin`），并复用 CLI 存放在 `$DSH_HOME/.dsh-1024store/client.json` 的共享匿名身份。上报为 fire-and-forget，失败静默，可通过 `DO_NOT_TRACK=1`、`DSH_1024STORE_TELEMETRY=0` 或 `npx @dsh-1024store/cli telemetry disable` 完全关闭（关闭时不会创建任何身份）。详见 [docs/install-analytics.md](../../docs/install-analytics.md)。
