# dsh1024

中文 | [English](README.md)

`dsh1024` 是 DeepSeek Harness 的 DSH 1024Store 包。一个 npm 包提供两个入口：

- **店内 1024 Store 插件** —— 把 [1024 Store](https://deepseek1024.com/)
  精选目录装进 DeepSeek Harness。安装后既可从设置左侧的 **1024 Store**
  直接进入，也可在 **设置 → 插件 → 1024 Store（插件数量）** 中打开。
- **可追踪安装 CLI** —— 官方 DeepSeek Harness 插件命令的轻量、可验证包装器。
  它安装目录插件，校验所选 DSH profile 确实包含该插件，并向 DSH 1024Store
  统计 API 上报一条匿名安装结果。

## 安装 CLI

一次性全局安装后，`dsh1024` 就能像官方 `dsh` 命令一样直接使用：

```sh
npm install -g dsh1024
```

不想安装也可以继续用 `npx dsh1024 …`。

## 安装店内插件

```sh
npm install -g dsh1024 && dsh1024 store
```

该命令通过官方 CLI 执行 `npx @deepseek-ai/dsh plugin --profile web add dsh1024`，
并匿名计入安装统计。直接使用官方 CLI 效果相同：

```sh
npx @deepseek-ai/dsh plugin --profile web add dsh1024
```

安装完成后重启 DeepSeek Harness。

店内插件通过 `/api/v1/registry` 动态查询目录，启动后自动检查自身版本，并支持
目录搜索、分类筛选、已安装识别、安装确认、卸载和操作进度。安装器只接受已通过
校验且出现在 1024 Store 目录中的 GitHub 仓库 URL。它会自行生成
`github:owner/repository` 参数，不执行目录中的展示命令。所有写操作都要求同源
POST，并且同一时间只允许一个插件操作。插件变更会在重启 DeepSeek Harness 后生效。

## CLI 用法

需要 Node.js 22 或更高版本。

```sh
dsh1024 add omdsh-dev/dsh-deep-research --profile web
```

包装器会在不经过 shell 的情况下执行：

```sh
npx --yes @deepseek-ai/dsh plugin --profile web add github:omdsh-dev/dsh-deep-research
```

如果 PATH 上已经装有官方 `dsh`，包装器会直接复用该可执行文件
（`dsh plugin --profile web add …`），省掉 npx 每次安装的解析开销；用
`DSH1024_DSH_PACKAGE` 钉版本时一律走 npx 形式。改变的只是定位官方 CLI 的方式，
参数、顺序、退出码与 stdio 完全不变。

`web` 是默认 profile。Git ref 可选：

```sh
dsh1024 add owner/repository#v1.2.0
```

包装器只消费被追踪的 `owner/repository`、共享的 `--profile`/`-p` 选项和第一个
`--` 分隔符；其余参数原样透传给官方插件命令。透传参数不会进入遥测事件或本地
receipt。完整的参数透传说明见 [English README](README.md)。

## 匿名安装遥测

每次通过 CLI 或店内插件安装、卸载后，都会向同一个公共端点上报一条匿名结果
事件（店内插件为 `sourceChannel: dsh-1024store-plugin`），并复用存放在
`$DSH_HOME/.dsh-1024store/client.json` 的共享匿名身份。上报为
fire-and-forget，失败静默，可通过 `DO_NOT_TRACK=1`、`DSH1024_TELEMETRY=0`
（旧写法 `DSH_1024STORE_TELEMETRY=0` 永久兼容）或
`npx dsh1024 telemetry disable` 完全关闭（关闭时不会创建任何身份）。详见
[docs/install-analytics.md](../../docs/install-analytics.md)。

遥测控制命令：

```sh
npx dsh1024 telemetry status
npx dsh1024 telemetry disable
npx dsh1024 telemetry enable
npx dsh1024 telemetry reset
```

## 从旧包迁移

`dsh1024` 取代已弃用的 `@dsh-1024store/cli` 与 `dsh-1024store` 两个 npm 包。
把 `npx @dsh-1024store/cli ...` 换成 `npx dsh1024 ...`，把
`dsh plugin --profile web add dsh-1024store` 换成
`dsh plugin --profile web add dsh1024` 即可；所有命令、选项与透传行为不变。
遥测偏好、匿名身份与本地 receipt 仍存放在 `$DSH_HOME/.dsh-1024store/`
下并原样复用，无需任何迁移步骤，也无需改环境变量名。

## 本地开发

在仓库根目录运行：

```sh
npm install
npm run market:test
```

把构建结果安装到隔离 profile：

```sh
DSH_HOME=/tmp/dsh-store-test dsh plugin --profile market-test add ./packages/dsh1024
DSH_HOME=/tmp/dsh-store-test dsh --profile market-test --port 14567
```

在 `packages/dsh1024` 目录内：

```sh
npm test
npm run pack:check
```
