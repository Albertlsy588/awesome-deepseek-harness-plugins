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
npm install -g dsh1024 && dsh1024 plugin --profile web add dsh1024
```

直接用官方 CLI 是同一条命令，只是换了个名字：

```sh
dsh plugin --profile web add dsh1024
```

安装完成后重启 DeepSeek Harness。

店内插件通过 `/api/v1/registry` 动态查询目录，启动后自动检查自身版本，并支持
目录搜索、分类筛选、已安装识别、安装确认、卸载和操作进度。安装器只接受已通过
校验且出现在 1024 Store 目录中的 GitHub 仓库 URL。它会自行生成
`github:owner/repository` 参数，不执行目录中的展示命令。所有写操作都要求同源
POST，并且同一时间只允许一个插件操作。插件变更会在重启 DeepSeek Harness 后生效。

## CLI 用法

需要 Node.js 22 或更高版本。

`dsh1024 plugin ...` **就是** `dsh plugin ...`，只是换了个命令名。`plugin`
之后的所有参数原样转发给官方 CLI —— 不增、不删、不重排、不补默认值：

```sh
dsh1024 plugin --profile web add github:omdsh-dev/dsh-deep-research
dsh plugin      --profile web add github:omdsh-dev/dsh-deep-research
```

上面两行执行的是同一个官方操作。包装器只负责它之外的事：核对结果 profile，
并记录一条匿名安装结果。

因为不补任何默认值，所有选项的行为与官方文档完全一致：不写 `--profile`
就照原样转发，而不是被悄悄补上；`--`、ref 以及其他官方参数也都保持官方语义：

```sh
dsh1024 plugin --profile web add github:owner/repository#v1.2.0
dsh1024 plugin --profile web add github:owner/repository -- \
  --ignore-scripts --reporter append-only --config.confirmModulesPurge=false
```

包装器会在不经过 shell 的情况下把第一条示例执行为：

```sh
npx --yes @deepseek-ai/dsh plugin --profile web add github:owner/repository#v1.2.0
```

如果 PATH 上已经装有官方 `dsh`，包装器会直接复用该可执行文件，省掉 npx 每次
安装的解析开销；用 `DSH1024_DSH_PACKAGE` 钉版本时一律走 npx 形式。改变的只是
定位官方 CLI 的方式，参数、顺序、退出码与 stdio 完全不变。

参数不会进入遥测事件或本地 receipt。

### 什么会被计入

包装器只读取参数向量用于归因，绝不改写它。只有在向量无歧义、且目标能解析出
目录仓库时才计入；其余情况照常安装但不计数——宁可漏记，也不错记。

向量必须写明 profile（`--profile <name>` 或 `--profile=<name>`；官方没有 `-p`
简写）、使用安装类动词（`add`、`i`、`install`）、在 `--` 之前只出现一个目标，
并且装进该 profile 自己的依赖（`-D`、`--save-dev`、`-O`、`--save-optional`、
`--save-peer`、`-g`、`--global` 一律不计入）。

| 目标 | 归因为 | id 来源 |
| --- | --- | --- |
| `github:owner/repository`、`owner/repository`（可带 `#ref`、`.git`） | `owner/repository` | 参数本身 |
| `dsh1024`、`dsh1024@<版本>` | 本目录仓库 | 固定 |
| 已发布的包名（可带版本 / tag / 范围） | 安装后清单里的仓库 | 安装成功后读 `node_modules/<包名>/package.json` 的 `repository` 字段 |
| 本地路径、`file:`、`link:`、`portal:`、URL、盘符、`~` | 一律不上报 | — |
| `gitlab:`、`bitbucket:`、`gist:`、`jsr:`、`workspace:`、`catalog:`、npm alias、完整 git URL | 不计入 | — |

包名反查只读一个本地文件——已安装包自己的 `repository` 字段，支持 npm 的字符串
与对象两种写法，且只接受 github.com 主机。monorepo 的 `directory` 会被忽略，
仓库根就是目录使用的身份。字段缺失、指向非 GitHub，或安装失败无从读取时，
该次安装不计入。

本地路径与 `file:`/`link:`/`portal:` 是硬边界：文件系统路径永远不会进入安装
事件、本地 receipt 或重试队列。

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
