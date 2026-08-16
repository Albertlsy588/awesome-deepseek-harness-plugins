# DSH 1024Store

<!-- 本文件由 scripts/build-readme.mjs 从 deepseek1024.com 目录 API 自动生成，请勿手工编辑。 -->

面向 [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness)（`dsh`）生态的社区插件目录，共收录 **3580** 个插件（含 PR 收录与 GitHub `dsh-plugin` topic 自动发现），目录数据更新于 2026-08-16。

**但这个仓库不只是一份 awesome list。** 维护这份目录所需要的全部基建都在这里开源：一个在线插件市场、一个把市场装进 `dsh` 本体的插件、一条定时自动收集并做格式校验的目录流水线，以及一套免费的公开查询 API。代码采用 MIT 协议，fork 之后就能部署成你自己的插件市场。

[![DSH 1024Store 插件市场首页](https://raw.githubusercontent.com/imsai-sh/awesome-deepseek-harness-plugins/assets/homepage.zh.png?v=b7ed0e720b42)](https://deepseek1024.com/)

[在线网站](https://deepseek1024.com/) · [API 文档](docs/api.md) · [英文目录](catalog/README.md) · [提交插件](CONTRIBUTING.md)

[![GitHub Stars](https://img.shields.io/github/stars/imsai-sh/awesome-deepseek-harness-plugins?style=social)](https://github.com/imsai-sh/awesome-deepseek-harness-plugins/stargazers)

## 项目亮点

### 在线插件市场（开源 · 可一键自部署）

[deepseek1024.com](https://deepseek1024.com/) 提供搜索、分类筛选、安装排行榜、插件详情与 GitHub 活跃度数据。整站跑在 Cloudflare Workers + D1 + KV 上，源码在 [`apps/web`](apps/web)。

想要一个完全属于自己的插件市场：fork 本仓库，把 `apps/web/wrangler.jsonc` 里的 `routes` 换成你自己的域名，创建 D1 数据库与 KV 命名空间，配齐 `secrets.required` 列出的 Worker secret，再把 `CLOUDFLARE_API_TOKEN` 与 `CLOUDFLARE_ACCOUNT_ID` 存为仓库 secret。配置完成后，每次 push 到 `main` 都由 GitHub Actions 自动执行 D1 迁移并部署 Worker，不需要自己写一行部署脚本。完整步骤见下文[本地运行与部署](#本地运行与部署)。

### 把插件市场装进 dsh 本体

不想切浏览器，就把市场本身作为插件装进 DeepSeek Harness：

```bash
dsh plugin --profile web add dsh-1024store
```

重启后「设置」里会出现独立的 **1024 Store** 入口，「设置 → 插件」下也会多出一个 **1024 Store（数量）** 标签页，可以直接搜索目录、按分类筛选、识别已安装状态、安装与卸载，并显示操作进度。安装器只接受目录中已校验过的仓库地址，并自行推导 `github:owner/repository`，不会执行目录返回的展示命令。源码见 [`packages/dsh-1024store`](packages/dsh-1024store)。

### 定时自动收集 + 格式校验

这是本目录与多数插件市场最大的区别：**目录不靠人肉维护，收录前一定过校验。**

- **定时收集**：Cloudflare Cron 每 30 分钟做一次增量扫描，用 `created:` 与 `pushed:` 两路搜索抓取带 `dsh-plugin` topic 的 GitHub 仓库；每周日再做一次全量对账，长期不活跃的仓库不会被漏收，掉了 topic 也只在一次成功的全量扫描后才下架。
- **格式校验**：每个候选仓库都要通过静态校验——读取默认分支的 Git tree，检查 `package.json`、`dsh.bundle.patch` 字段，以及 patch 文件在同一棵 tree 中确实存在。**全程只读文件，绝不安装依赖、绝不执行仓库代码。** 校验不通过就不进目录。
- **自动同步**：PR 合并后由 CI 自动同步目录到网站数据库并刷新本 README，贡献者和维护者都不需要手工改任何生成文件。

调度节奏、GitHub API 限额与失败行为见 [插件发现运维文档](docs/plugin-discovery.md)。

### 免费查询 API

目录数据免费开放，匿名即可调用：

```bash
curl 'https://api.deepseek1024.com/v1/plugins/search?q=memory'
```

匿名调用每天 50 次、每分钟 10 次；用 GitHub 账号登录网站创建 API Key 后提升到每天 500 次、每分钟 30 次。另有 `/api/v1/registry` 返回全量目录快照——本 README 就是由它生成的。完整端点、参数与错误码见 [API 参考](docs/api.md)。

## 参与进来

这个项目由社区维护，下面每一种参与都真的有用：

- **点个 Star** — [Star 本仓库](https://github.com/imsai-sh/awesome-deepseek-harness-plugins/stargazers)是成本最低、帮助最大的支持，能让更多 DeepSeek Harness 用户找到这里。
- **提 Issue** — 插件信息有误、分类不合理、网站或 API 有问题、想要新功能，都欢迎[提 Issue](https://github.com/imsai-sh/awesome-deepseek-harness-plugins/issues/new)。
- **发 PR** — [提交你自己的插件](CONTRIBUTING.md)，或改进网站、CLI、市场插件与目录流水线，欢迎直接发 [Pull Request](https://github.com/imsai-sh/awesome-deepseek-harness-plugins/pulls)。
- **Fork 自建** — 想要自己的插件市场，[Fork](https://github.com/imsai-sh/awesome-deepseek-harness-plugins/fork) 之后按上面的步骤配置即可，MIT 协议，随便改。

## 安装插件并计入统计

网站优先提供开源包装 CLI；它会调用官方 DeepSeek Harness 插件命令、校验 profile 的真实安装结果，并把匿名安装结果可靠地上报到排行榜：

```bash
npx @dsh-1024store/cli add <owner>/<repository> --profile web
```

仓库标识和 `--profile` 之外的参数会原样传给官方 CLI；参数可能与包装器冲突时可放到 `--` 后，例如 `... -- --ignore-scripts --reporter append-only`。透传参数不会写入遥测或本地 receipt。

统计身份是保存在 `$DSH_HOME/.dsh-1024store/` 的随机安装实例 ID，不是实名用户或账号。CLI 不上传命令输出、路径、用户名、环境变量、会话内容或原始错误；可用 `npx @dsh-1024store/cli telemetry disable`、`DO_NOT_TRACK=1` 或 `DSH_1024STORE_TELEMETRY=0` 关闭。直接使用官方 `dsh plugin` 命令仍然可用，但不会计入 DSH 1024Store 安装统计。详细字段、口径、存储和部署方式见 [安装统计设计](docs/install-analytics.md)，CLI 源码见 [`apps/cli`](apps/cli)。

## 提交插件

### 使用 Agent Skill 提交（推荐）

如果你使用 Codex、Claude Code、Cursor 或其他兼容 Agent Skills 的编程助手，可以安装本仓库提供的提交 Skill：

```bash
npx skills add imsai-sh/awesome-deepseek-harness-plugins --skill submit-dsh-plugin -g
```

安装后告诉助手：

```text
使用 $submit-dsh-plugin 检查并提交我的 DeepSeek Harness 插件。
```

该 Skill 会检查插件仓库、生成唯一允许提交的目录 JSON、验证变更范围，并在获得授权后创建 PR。新增条目的非草稿 PR 通过静态审查后会自动合并；修改或删除既有条目的 PR 同样会跑静态审查，但不会自动合并，需要维护者人工审核后手动合并。合并后 CI 自动同步目录到网站数据库并刷新本 README，贡献者和维护者都不需要手工更新任何生成文件。查看 [Skill 源码](skills/submit-dsh-plugin/SKILL.md)。

### 手动提交

欢迎把你的 DeepSeek Harness 插件提交到本目录。请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，通过 PR 提交一个新的结构化插件文件；自动审查将验证提交范围和最基础的 DeepSeek Harness 插件配置，通过后自动合并，并由 CI 自动同步到网站与本 README。需要修正或下架既有条目时也可以发 PR，静态审查照常运行，但这类 PR 由维护者人工审核后合并。

安装命令：`npx @dsh-1024store/cli add <owner>/<repository> --profile web`。

## 项目定位

本项目与 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 都服务于 DeepSeek Harness 插件生态。在继承其目录数据与社区整理思路的基础上，本项目把「一份人工维护的列表」扩展成一套开源、可自部署的插件市场基建：自动发现与静态校验的目录流水线、在线市场网站、dsh 内置市场插件与免费查询 API，具体见上文[项目亮点](#项目亮点)。

## 项目结构

```text
catalog/plugins/    插件提交表单与 curated 元数据（每个插件一个 JSON）
catalog/categories.json  分类定义（唯一分类信源）
skills/             面向贡献者的可安装 Agent Skills
apps/cli/           上报安装统计的开源包装 CLI
apps/web/src/       React + Vite 前端
apps/web/worker/    Cloudflare Worker API 与数据刷新（唯一读写 D1 的进程）
packages/dsh-1024store/  1024 品牌的 DSH 设置页内插件市场
scripts/            提交审查、目录同步与 README 生成脚本
```

线上目录数据的唯一信源是 Cloudflare D1；本 README 与 [catalog/README.md](catalog/README.md) 由 CI 从目录 API 全量生成，职责划分见 [仓库布局](docs/repository-layout.md)。

## 本地运行与部署

需要 Node.js 22+、npm 10+。本地开发：

```bash
npm ci
cd apps/web
npx wrangler d1 migrations apply dsh-store-star-history --local
cd ../..
npm run dev
```

浏览器访问 <http://127.0.0.1:5173>。如需完整 GitHub 数据，可在 `apps/web/.dev.vars` 中配置 `GITHUB_TOKEN`；本地接收安装事件还需要一个至少 32 字符的 `INSTALL_CLIENT_HASH_SECRET`。

部署到 Cloudflare Workers：

```bash
cp apps/web/.env.example apps/web/.dev.vars
# 在 apps/web/.dev.vars 中填写 GITHUB_TOKEN 和 INSTALL_CLIENT_HASH_SECRET
npx wrangler login
npm run build
cd apps/web
npx wrangler d1 migrations apply dsh-store-star-history --remote
npx wrangler deploy --secrets-file .dev.vars
```

`wrangler.jsonc` 已声明 KV、D1、Durable Object、Cron 定时任务和静态资源配置。生产环境要先执行 `npm run db:migrate:remote`，再部署 Worker；完整顺序、GitHub API 限额和费用估算见 [Cloudflare 插件发现运维文档](docs/plugin-discovery.md)，公开 API 见 [API 参考](docs/api.md)。请勿提交 `.dev.vars`。

## 致谢

感谢以下项目为本目录提供基础与参考：

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)：提供插件系统、`dsh.bundle` 规范和插件开发文档。
- [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)：提供初始插件目录数据和社区目录设计参考。

## 插件分类

分组默认折叠，点开即可展开。策展分类完整列出；自动发现的「待分类」条目太多，只列出其中一部分，完整目录请在[在线网站](https://deepseek1024.com/)搜索浏览。

- [UI 增强](#ui) (57)
- [主题与外观](#theme) (3)
- [会话与消息](#session) (18)
- [记忆](#memory) (14)
- [工具与能力](#tools) (72)
- [技能包](#skill) (4)
- [工作流与自动化](#workflow) (20)
- [通知与集成](#notify) (16)
- [模型与账号接入](#model) (7)
- [开发与运行时](#dev) (45)
- [娱乐](#fun) (17)
- [待分类](#unclassified) (3307)

<a id="ui"></a>

<details>
<summary><strong>UI 增强</strong> · 57 个插件</summary>

- [deepseek-harness-tui](https://github.com/openma-ai/deepseek-harness-tui) — Rust/ratatui 终端客户端，直接使用 DSH SDK JSON-RPC 协议，支持独立运行或作为 profile bundle 加载。
- [ds-api-usage](https://github.com/Sev7een/ds-api-usage) — 在设置页展示 DeepSeek API 余额与最近 24 小时用量，包括估算消费、Token、请求次数和按小时时间线。
- [dsh-101](https://github.com/bill9109/dsh-101) — DSH 文档阅读模式。
- [dsh-annotation](https://github.com/omdsh-dev/dsh-annotation) — 选中文字→批注→随消息发送，回复按批注逐条对照。
- [dsh-answer-pet](https://github.com/Nanki-nn/dsh-answer-pet) — 蓝鲸桌面宠物：按会话实时展示回答进度、模型动作与工具调用轨迹、token、输出速率与耗时，并支持多会话状态卡片展开和收起。
- [dsh-at-file](https://github.com/omdsh-dev/dsh-at-file) — Codex 风格的 `@file` 文件引用，输入框里直接搜索并引用工作区文件。
- [dsh-auto-continue](https://github.com/HsiangNianian/dsh-auto-continue) — DSH Web 请求中断自动续跑：网络、超时或宿主崩溃等非人为失败后自动发送「继续」，支持错误分类、自适应退避、模板化继续文本与浏览器通知。
- [dsh-balance-meter](https://github.com/Ghost011118/dsh-balance-meter) — 输入框 dock 显示 DeepSeek 账户余额与会话花费，自动拉取官方定价，支持高峰/低谷计价。
- [dsh-balance-plugin](https://github.com/stevenx65/dsh-balance-plugin) — dsh 网页侧边栏的 DeepSeek 余额与 token 用量监控：今日/累计切换，并按 provider 过滤其他厂商。
- [DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) — 侧边栏完整工作台：内置文件渲染编辑、终端、Git 与子代理，支持三方插件注册新 Tab。
- [dsh-builtin-toggles](https://github.com/Starfie1d1272/dsh-builtin-toggles) — 为 DSH Web 添加官方内置插件目录、搜索与状态说明，并提供经过审核的安全 UI 插件开关。
- [dsh-calculator](https://github.com/bobcat848/dsh-calculator) — 右侧面板展示 DeepSeek API 费用（当前会话 + 全部会话累计）与账户余额，内置官方计价与峰谷计价支持。
- [dsh-chat-outline](https://github.com/liliuCourier/dsh-chat-outline) — 对话栏左侧常驻大纲：按轮次列出提问与最后回复，支持关键词过滤与一键跳转。
- [dsh-cost-meter](https://github.com/Han-1413141/dsh-cost-meter) — 会话与当日 API 费用统计、预算图框（已用%）、官方余额、历史看板，支持峰谷计价与官方价格一键同步。
- [dsh-cost-meter](https://github.com/Sttrevens/dsh-cost-meter) — Web UI 美元成本徽标：头部显示会话总成本、每条回复结尾显示该轮成本，悬停看分项。
- [dsh-deeplink](https://github.com/qyw233/dsh-deeplink) — `?session=` / `?workspace=` 深链直达指定项目对话。
- [dsh-deepseek-billing](https://github.com/Jolly-J/dsh-deepseek-billing) — 在 Web UI 侧边栏显示 DeepSeek 账户余额和当前会话费用估算。
- [dsh-diff-viewer](https://github.com/lehhair/dsh-diff-viewer) — PiUI 风格 diff 查看器，替换 write/edit 工具调用的默认 DiffBlock。
- [dsh-drag-and-drop](https://github.com/AKIRACOD/dsh-drag-and-drop) — 拖放 fork：文档以可删除「文件芯片」挂在输入框上方，不打字也能发送。
- [dsh-drag-and-drop](https://github.com/bill9109/dsh-drag-and-drop) — 跨平台文件拖拽与原始路径插入，无需复制文件。
- [dsh-file-mentions](https://github.com/a903067276-rgb/dsh-file-mentions) — DSH 回复中的文件路径可点击：Codex 风格行内打开、文件管理器定位、回合尾部文件 chip 列表。
- [dsh-file-uploads](https://github.com/l541402398/dsh-file-uploads) — 从 Web 输入框上传任意本地文件，以待发送卡片展示，并在设置中管理已存文件。
- [dsh-files](https://github.com/taxueseek/dsh-files) — 文件上传（彩色附件卡片、会话隔离存储、sha256 去重、TTL 清扫）+ 内容嗅探的 read_document 文档读取（PDF/DOCX/XLSX/TXT）。
- [dsh-focus-chat](https://github.com/dingyi222666/dsh-focus-chat) — 「聚焦会话」精简视图，只关注最终产出结果。
- [dsh-genui](https://github.com/omdsh-dev/dsh-genui) — 助手回复内渲染交互式 UI 组件：布局、图表、表单、测验、mermaid、3D 场景与回传事件循环。
- [dsh-hud](https://github.com/a903067276-rgb/dsh-hud) — HUD 状态面板：Git 状态、MCP 服务器、技能列表、模型与 token 用量，悬浮侧栏一览无余。
- [dsh-message-preview](https://github.com/asukasec/dsh-message-preview) — 右侧用户消息导航条，根据消息数量与可用高度自适应排布导航块，并支持悬停预览、键盘操作与点击跳转。
- [dsh-mic-input](https://github.com/QT-Chen/dsh-mic-input) — 输入框麦克风语音输入：浏览器 Web Speech API 实时转写，自动去重/续听、智能标点，支持语言与自动发送设置。
- [dsh-milestone](https://github.com/SnowCrescenter-tech/dsh-milestone) — 右侧圆点时间轴导航条，点击跳转到任意用户消息。
- [dsh-navbar](https://github.com/vlln/dsh-navbar) — 对话节点导航条，右缘节点串快速跳转 user 消息。
- [dsh-opencode-go-usage](https://github.com/v587d/dsh-opencode-go-usage) — 在输入框上方 dock 显示 OpenCode Go 订阅用量（5h 滚动/每周/每月窗口与重置倒计时），内置凭据编辑器。
- [dsh-openpencil](https://github.com/ZSeven-W/dsh-openpencil) — OpenPencil 设计预览与编辑插件。
- [dsh-pet](https://github.com/zealot00/dsh-pet) — DSH Web UI 桌面宠物：精灵图动画、agent 状态联动、拖拽、闹钟（每天/一次）与番茄钟，皮肤下拉选择 + 预览。
- [dsh-plugin-deepseek-balance](https://github.com/fishxcode/dsh-plugin-deepseek-balance) — 在 DSH Web 设置中展示 DeepSeek API 余额、余额趋势与每日用量图表。
- [dsh-plugin-hub](https://github.com/Noob-stupid/dsh-plugin-hub) — 插件管理面板：已安装插件一键启用/停用，内置 GitHub dsh-plugin 插件市场，支持详情查看与一键安装。
- [dsh-side-panel](https://github.com/ccq1/dsh-side-panel) — 侧边栏集成文件浏览器、终端和 Git 审查，方便预览文件。
- [dsh-spend](https://github.com/nonewind/dsh-spend) — DSH Web 用量与费用统计插件：右下角悬浮窗，按模型/按天/按会话多维聚合与预计花费。
- [dsh-spotlight](https://github.com/0xsline/dsh-spotlight) — 键盘优先的命令面板（command palette）。
- [dsh-sticky-disclosure](https://github.com/Han-1413141/dsh-sticky-disclosure) — 一键收起会话中所有展开的区块（Think、工具卡等），常驻计数按钮 + 自定义快捷键。
- [dsh-sticky-note](https://github.com/Meredith2328/dsh-sticky-note) — 编辑框工具栏便签，随手记点子和 TODO，自动保存为 Markdown，一键发送到对话。
- [dsh-task-dag](https://github.com/LeemanCheung/dsh-task-dag) — 将会话子代理与持久工作流运行展示为实时 DAG，支持状态展示、节点导航与重启后历史恢复。
- [dsh-task-status](https://github.com/vlln/dsh-task-status) — 后台任务状态条：对话页任务进度 + 实时输出 tail。
- [dsh-tianshu-tui](https://github.com/huiliyi37/dsh-tianshu-tui) — DeepSeek Harness 的终端 UI（TUI）。
- [dsh-token-usage](https://github.com/LaoYueHanNi/dsh-token-usage) — 按请求持久化模型 token 用量，Web 设置「Token 用量」统计页：按日趋势图、按模型明细表、日期/模型筛选。
- [dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI) — Claude Code 风格全屏终端 UI：像素鲸鱼顶栏、实时工作状态行、思考流式展开。
- [dsh-turn-navigator](https://github.com/vibeinging/dsh-turn-navigator) — 对话轮次导航。
- [dsh-ux](https://github.com/jiangnanquan/dsh-ux) — Solarized 浅色主题、紧凑布局、思考/工具链折叠胶囊，以及余额、本轮成本与用量看板的 DSH Web 界面增强插件。
- [dsh-visualize](https://github.com/Nagi-ovo/dsh-visualize) — 对话内生成式 UI：模型把交互式 HTML 卡片直接画进会话流，带流式预览与沙箱渲染。
- [dsh-web-archive](https://github.com/renat3u/dsh-web-archive) — 折叠对话中的 Think、Bash 等「无用消息」。
- [dsh-web-attention-badge](https://github.com/Luaphes/dsh-web-attention-badge) — 会话需要你时三处同时亮起：角标、标签页标题计数、按状态换色的鲸鱼 favicon。
- [dsh-web-ui](https://github.com/zhu1090093659/dsh-web-ui) — DSH Web UI 插件与皮肤合集：任务看板、git 图、右侧面板、远程移动端 UI、桌宠、实时 token 统计与皮肤中心。
- [dsh-whale-animation](https://github.com/LeemanCheung/dsh-whale-animation) — DSH Web 状态文字旁的持久化黑色鲸鱼深潜动画，提供减少动态效果回退与无缝闭环。
- [dsh-workspace-search](https://github.com/tsonglew/dsh-workspace-search) — VS Code 式工作区关键词搜索 Tab（better-sidebar 扩展）：同时匹配文件名与文件内容，结果按文件分组带行号，点击在侧栏编辑器打开。
- [ex-setting](https://github.com/omdsh-dev/ex-setting) — DSH 的设置扩展。
- [ui-status-label](https://github.com/alingalingling/ui-status-label) — 把鲸鱼娘思考时的 "deep diving" 状态文案自定义成任意你想要的样子。
- [web-components](https://github.com/omdsh-dev/web-components) — Web Components 支持。
- [widget-dock](https://github.com/MorGogh/widget-dock) — 对话两侧空白区的可拖动卡片工作台：余额、Token 用量、会话统计、目标、成本估算等小组件，支持 S/M/L/XL 尺寸档位与官方定价成本估算。

</details>

<a id="theme"></a>

<details>
<summary><strong>主题与外观</strong> · 3 个插件</summary>

- [dsh-deep-whale](https://github.com/Small-tailqwq/dsh-deep-whale) — DSH Web 鲸鱼娘皮肤系列（深海女仆工坊 maid-atelier）。
- [dsh-skin](https://github.com/KinGao294/dsh-skin) — Codex 风格皮肤切换器 + 自定义壁纸层，可调透明度与模糊。
- [dsh-stylevault](https://github.com/GptsApp/dsh-stylevault) — StyleVault 主题系统：30 套忠实经典配色（Catppuccin、Nord、Tokyo Night、Gruvbox、Solarized、Dracula、One Dark、Rosé Pine 等），映射官方 ThemeService token；完整 Style Settings 面板支持颜色/字体/圆角 live 微调，配置可导出/导入 JSON 分享。

</details>

<a id="session"></a>

<details>
<summary><strong>会话与消息</strong> · 18 个插件</summary>

- [dsh-chat-import](https://github.com/Nwflower/dsh-chat-import) — 把 Claude Code / Codex / ChatGPT / Cursor / Gemini / Reasonix / opencode 的聊天记录全保真导入为可续聊的 DSH 会话。
- [dsh-conversation-share](https://github.com/bill9109/dsh-conversation-share) — 分享任意段落的对话。
- [dsh-crosstalk](https://github.com/Jesse-njx/dsh-crosstalk) — 跨会话消息：本机任意会话都可像 Claude Code 一样列出并互发消息，基于本地心跳注册表与收件箱。
- [dsh-explain](https://github.com/yuezengwu/dsh-explain) — 本地优先学习模式：跨会话全局学习线程、按来源讲解。
- [dsh-file-claim](https://github.com/Nwflower/dsh-file-claim) — 同一工作区并行多会话的文件认领与写入保护（claim/release、心跳 stale 接管、pending 三路合并）。
- [dsh-inline-images](https://github.com/3403473060/dsh-inline-images) — 对话内联图片：LLM 回复中输出的本地图片路径在消息正文直接渲染为图片（9 种格式、点击放大灯箱、可调尺寸）。
- [dsh-interconnect](https://github.com/Chinesezjc/dsh-interconnect) — 跨实例互联：经 interconnect 服务在多个 DSH 实例间转发消息与事件。
- [dsh-message-edit](https://github.com/Moeblack/dsh-message-edit) — 基于分支的消息编辑、reroll、重试与版本时间线。
- [dsh-peer-link](https://github.com/czm15053/dsh-peer-link) — 让 dsh 和 Claude Code 会话直接互发消息，附带可点击的会话列表卡片（搜索/刷新/弹窗发送）。
- [dsh-prompt-stash](https://github.com/Wine-Red/dsh-prompt-stash) — 本地、按会话隔离的 LIFO 输入暂存：临时收起未完成的输入，之后安全恢复并继续编辑。
- [dsh-prompt-studio](https://github.com/Moeblack/dsh-prompt-studio) — 带实时预览的用户/内置 system prompt 分节编辑器。
- [dsh-session-export](https://github.com/bwndlct/dsh-session-export) — 把当前会话导出为可移植、带 schema 版本的 Markdown 与 JSON 文件，提供 `session_export` 工具与斜杠命令两种入口，文件名跨平台安全。
- [dsh-share](https://github.com/hellodigua/dsh-share) — 一键分享你的对话。
- [dsh-side-chat](https://github.com/heartmove/dsh-side-chat) — 选中对话片段，在右侧面板的侧边聊天中提问（按会话隔离）；AI 回复可原文或摘要后带回主会话。
- [dsh-sidechain](https://github.com/Buyi-wsgzg/dsh-sidechain) — `/side` 持续性侧会话与 `/btw` 一次性侧问，在临时 fork 中运行、不写入主会话历史。
- [dsh-token-usage](https://github.com/LeemanCheung/dsh-token-usage) — 持久化记录每个会话的 Token 用量，在设置页提供 provider/model 统计与最近 52 周活跃度热力图。
- [dsh-turn-rewind](https://github.com/Anionex/dsh-turn-rewind) — 对话回退：基于持久 Change Ledger 回滚会话与工作区状态。
- [task-passport](https://github.com/dongsheng123132/task-passport) — 通过机器可读检查点与乐观锁，在 DeepSeek Harness、WorkBuddy、Claude Code 和 Codex 之间交接持久任务状态。

</details>

<a id="memory"></a>

<details>
<summary><strong>记忆</strong> · 14 个插件</summary>

- [distill](https://github.com/LoserFox/distill) — 自动对话蒸馏：后台 subagent 反省 + 技能 create/update。
- [dsh-context](https://github.com/bowenliang123/dsh-context) — 为 DeepSeek Harness 网页界面添加上下文洞察面板，展示模型上下文窗口当前的构成与演变过程：各部分占比与窗口大小对照、按请求的历史趋势、压缩与注入事件，以及消息级 token 统计。
- [dsh-file-memory](https://github.com/ICCuse/dsh-file-memory) — 文件型工作记忆：memorize/recall 把关键前提逐字保存在会话笔记文件，无损挺过上下文压缩。
- [dsh-knowledge](https://github.com/ICCuse/dsh-knowledge) — 全局知识库桥：kb_add/kb_search/kb_show/kb_timeline 读写与 Codex 共享的 D:\knowledge（格式逐字节兼容）。
- [dsh-memento](https://github.com/PerryLink/dsh-memento) — 有界、分层、带审批门、可审计的跨会话记忆：`ctx.memory` 服务 + 零依赖 SQLite 存储 + `memory` 工具与冻结快照注入；写入必过审批门，模型可见内容可自会话日志重建。
- [dsh-memory](https://github.com/Jesse-njx/dsh-memory) — 基于 DSH 无损会话日志的引用式记忆：蒸馏出的事实带 `(sessionId, eventRange)` 引用，可随时展开回原始日志片段。
- [dsh-memory-meow](https://github.com/Phant0Meow/dsh-memory-meow) — 项目级跨会话记忆：PROJECT.md 快照注入首条用户消息（缓存友好）+ memory_remember 工具 + ReAct 任务结束自动反思；各项目独立记忆文件，互不互通。
- [dsh-memory-vault](https://github.com/flymysql/dsh-memory) — 跨会话记忆库：remember / recall / forget 工具、每轮提示注入与设置页条目浏览。
- [dsh-mneme](https://github.com/modusensus/dsh-mneme) — 跨会话记忆：SQLite + 可人工编辑的 Markdown 镜像，后台自动巩固（去重/合并/冲突裁决），提供 6 个记忆工具。
- [dsh-mnemon](https://github.com/omdsh-dev/dsh-mnemon) — Mnemon 深度集成：本地三层记忆（Runtime Memory、可检索 Documents、受监督 Memory Spaces）。
- [dsh-plugin-asmemory](https://github.com/Xplore-LAB/dsh-plugin-asmemory) — 动作-状态时序记忆：记录类型化的状态与动作，做趋势、异常与因果关联分析。
- [dsh-premise-guard](https://github.com/ICCuse/dsh-premise-guard) — 压缩后前提漂移守卫：摘要丢失关键字面锚点时注入一次性提醒。
- [nowledge-mem-deepseek-harness](https://github.com/nowledge-co/nowledge-mem-deepseek-harness) — 给所有 AI 工具和 Agent 共用的一层记忆：注入 Context Bundle、提示时检索、MCP 工具与回合结束 DSH 线程捕获。
- [sgme](https://github.com/freehul/sgme) — 拾光记忆引擎（SGME）桥接：多智能体共享长期记忆（HTTP）—— L0/L1/L1.5/L2 分层提炼、按场景注入、统一检索、主动关怀信号（memory_search / wiki_search / signal_pull / signal_claim / signal_ack），npm 包名 `dsh-sgme`。

</details>

<a id="tools"></a>

<details>
<summary><strong>工具与能力</strong> · 72 个插件</summary>

- [@zhaoolee/dsh-notes](https://github.com/zhaoolee/notes) — 将 DSH 对话导出为锤子便签风格 PNG，或在配置的账号工作区中新建和更新 Markdown 便签。
- [argo](https://github.com/taxueseek/argo) — 专为 agent 打造的搜索工具：多语言，覆盖中文/英文/学术/代码/购物/金融/新闻/百科。
- [blender](https://github.com/CheshireJCat/blender) — Blender 3D 生产插件：提供 30 个建模/重建 Skill、13 个运行时工具和 26 个确定性 Helper，覆盖参考图拟合、渲染、验证、动画与可移植格式导出；npm 包名 `dsh-blender`。
- [dsh-1024store](https://github.com/imsai-sh/awesome-deepseek-harness-plugins) — DSH 1024Store 官方商店插件：设置页内浏览/搜索 deepseek1024.com 实时目录，按分类筛选，确认后一键安装/卸载，支持自更新检查。
- [dsh-adb](https://github.com/SamXiaBing/dsh-adb) — ADB 设备·台架运维工具集：设备发现、结构化 logcat（后台采集）、apk 安装、文件 pull/push、性能快照。
- [dsh-adhd-copilot](https://github.com/zimai233/dsh-adhd-copilot) — ADHD 行为辅导技能：任务拆解、事项过载管理、启动仪式与失败重启。
- [dsh-apple-mode](https://github.com/jihongboo/dsh-apple-mode) — DSH 的 Xcode AI 集成：26 个 Xcode MCP 工具（mcpbridge）+ Apple 平台技能 + Xcode Intelligence 风格 persona（agent preset 或全局 bundle）。
- [dsh-backup](https://github.com/xiaoyuyu6420/dsh-backup) — 一键备份 DSH 用户数据：/backup 命令、定时自动备份、sha256 校验与自动轮换。
- [dsh-bash-terminal](https://github.com/MAXeaglet/dsh-bash-terminal) — 一个 shell 工具：Windows 上统一执行 PowerShell / Git Bash / WSL，外加交互式 PTY 终端，默认终端由用户在设置中选择。
- [dsh-browser](https://github.com/Lum1104/dsh-browser) — Chrome 侧边栏扩展，让 DSH 直接操控你的浏览器，无需视觉能力。
- [dsh-code-intel](https://github.com/lonelymoon87/dsh-code-intel) — 用 Tree-sitter 建立工作区符号索引，提供词法或可选 embedding 辅助的代码检索。
- [dsh-computer-use](https://github.com/Anionex/dsh-computer-use) — macOS 电脑控制：Accessibility 观测、过期状态拒绝、作用域权限与安全输入。
- [dsh-context-proxy](https://github.com/EvilIrving/dsh-context-proxy) — 按需取回薄层：context_query / context_slice / context_grep 三个工具读取已持久化的历史，引用可回放。
- [dsh-continual-evolve](https://github.com/ZK-Andy/dsh-continual-evolve) — 持续自进化：从会话轨迹沉淀版本化、可审计、可回滚的 harness 状态（提示词/记忆/技能/子代理规格），带审查门禁与技能热加载。
- [dsh-cowork](https://github.com/Jesse-njx/dsh-cowork) — doc_read/doc_write：以有界、单元格寻址的方式读写 xlsx / pdf / docx / pptx / ipynb，另附 MCP 服务器与 CLI。
- [dsh-custom-tool](https://github.com/omdsh-dev/dsh-custom-tool) — 用 Monaco 编辑器创建和管理沙箱化的自定义 JavaScript 工具。
- [dsh-data-agent](https://github.com/omdsh-dev/dsh-data-agent) — 让 AI 帮你连数据库、写 SQL。
- [dsh-docker](https://github.com/Jesse-njx/dsh-docker) — 类型安全、带护栏的容器控制：ps/logs/inspect/exec/start/stop 与 compose up/down，JSON 输出、项目感知定位、破坏性操作需审批。
- [dsh-exam-countdown](https://github.com/zimai233/dsh-exam-countdown) — 查询 64 场中国考试（高考/考研/四六级/CPA/法考…）的规则日期（第二个周六、第一个周日）与倒计时。
- [dsh-excel-chat](https://github.com/hccccc01333/dsh-excel-chat) — 在 DeepSeek Harness 里对话完成 Excel 工作：建表、编辑、修复公式、图表校验，每次编辑后自动体检公式。
- [dsh-figma-to-lottie](https://github.com/zimai233/dsh-figma-to-lottie) — 将 SVG 路径与关键帧参数编译成自包含的 Lottie JSON 动画文件。
- [dsh-find-plugin](https://github.com/awesome-dsh-plugin/dsh-find-plugin) — 会话内直接找插件：按关键词/分类搜索本精选 registry，返回描述与可直接执行的安装命令。
- [dsh-fleet-audit](https://github.com/LeslieWylie/dsh-fleet-audit) — 只读的 agent 机群凭据卫生审计：检查凭据文件权限、git remote 内嵌凭据（输出脱敏）与 provider token 字面量计数；零依赖、确定性。
- [dsh-hdc-bridge](https://github.com/1na-ko/dsh-hdc-bridge) — 鸿蒙设备桥：hdc 截图/装包/日志/崩溃/UI 自动化闭环（配 read_image 看图），官方优先版本化 API 知识层（SDK .d.ts + 离线随包文档），以及 DevEco CLI 构建/签名/lint 通道。
- [dsh-image-search](https://github.com/zimai233/dsh-image-search) — 多引擎反向识图聚合：Google Lens、百度、Yandex、TinEye、SauceNAO、IQDB、Ascii2d。
- [dsh-kb-sieve](https://github.com/omdsh-dev/dsh-kb-sieve) — 从 md/txt/docx/pdf 构建可审计知识库包（SQLite FTS5），确定性检索与原文阅读。
- [dsh-market](https://github.com/dsh-market/dsh-market) — 装在 DSH 里的插件市场：设置页内逛/搜全部社区插件，按分类筛选，确认后一键安装，已装插件一目了然。
- [dsh-mcp-lens](https://github.com/labmimors/dsh-mcp-lens) — DeepSeek Harness 的渐进式披露 MCP 网关：保持两个面向模型的工具，按需返回排序后的远端精确 inputSchema，再调用明确的 server/tool。
- [dsh-md-preview](https://github.com/LeslieWylie/dsh-md-preview) — 把 Markdown 渲染为自包含的独立 HTML 页面：提供在 headless 配置下同样可用的 `md_html_render` 工具，以及在网页端浏览、预览、编辑并导出本地 `.md` 文件的抽屉；两个入口共用同一个渲染器，无运行时依赖。
- [dsh-mobile-gui-agent](https://github.com/kunjinkao-os/dsh-mobile-gui-agent) — Android GUI Agent：ADB 截图、压缩 UI hierarchy 定位、逐步动作验证、审批和 Mobile Web 视图。
- [dsh-net-proxy](https://github.com/mafeis/dsh-net-proxy) — 让 agent 的网络请求走本机 HTTP/CONNECT/SOCKS5 代理。
- [dsh-openmaic](https://github.com/THU-MAIC/dsh-openmaic) — OpenMAIC 教学：课堂、幻灯片、交互组件与苏格拉底式教学。
- [dsh-overleaf](https://github.com/fly233338/dsh-overleaf) — 通过 OverleafMCP 将多个 Overleaf 项目接入 DSH，支持浏览、分析和通过 Git 写回 LaTeX 文件。
- [dsh-plugin](https://github.com/PicGo/dsh-plugin) — 通过 PicGo 已有配置（PicGo Cloud、GitHub、S3、腾讯云 COS、七牛，或任意已安装的上传插件）把本地图片和文件上传到图床，提供 `picgo_upload` 工具与 `/picgo` 命令。
- [dsh-plugin-knowledge-graph](https://github.com/Luke-Yong/dsh-plugin-knowledge-graph) — 基于代码库知识图谱的 read_graph 工具（CONTAINS / EXPORTS / IMPORTS / IMPORTS_SYMBOL 关系）。
- [dsh-plugin-mineru](https://github.com/HuanLinOTO/dsh-plugin-mineru) — 向模型暴露 MineRU 文档解析工具。
- [dsh-recommend](https://github.com/zp-home/dsh-recommend) — DSH 插件透明排行与推荐：每日自动抓取 `dsh-plugin` 话题生态，公开评分模型，提供 rank/search/recommend 工具与设置页榜单。
- [dsh-remote](https://github.com/flymysql/dsh-remote) — 多机远程工作区：管理多台 SSH 主机，在原生「添加工作区」流程里选本机系统文件夹或远程目录，把远程工作区镜像成真实本地文件夹并用 rw_* 工具操作。
- [dsh-scholar](https://github.com/lzszq/dsh-scholar) — 学术助手插件。
- [dsh-session-audit](https://github.com/bwndlct/dsh-session-audit) — 会话执行分析：步骤、工具调用、失败、重复动作、token 用量与验证信号，输出 text/Markdown/JSON 报告。
- [dsh-skillport](https://github.com/Jesse-njx/dsh-skillport) — 把已有的 Agent Skills（SKILL.md）技能库带进 DSH：扫描 Claude/Codex/Cursor/Gemini 技能目录、注入渐进式索引，按需加载技能正文。
- [dsh-subagent-cwd](https://github.com/lynx-gt/dsh-subagent-cwd) — 在 dsh-subagent-tools 基础上增加子代理按调用 cwd，附带所需的两个 in-process provider 补丁。
- [dsh-subagent-tools](https://github.com/lynx-gt/dsh-subagent-tools) — 子代理委派的按调用覆盖：model/provider/persona/toolFilter、@preset: 引用与 provider/model 组合 id。
- [dsh-tool-calculator](https://github.com/omdsh-dev/dsh-tool-calculator) — 安全的数学表达式求值器，零依赖递归下降解析器。
- [dsh-tool-csv](https://github.com/omdsh-dev/dsh-tool-csv) — CSV 解析/查询/统计/转换（RFC 4180），零依赖状态机解析器。
- [dsh-tool-diff](https://github.com/omdsh-dev/dsh-tool-diff) — 文本/JSON/CSV/Markdown 结构化比较与 unified diff。
- [dsh-tool-encoding](https://github.com/omdsh-dev/dsh-tool-encoding) — base64/url/hex 编解码、常用哈希、UUID 生成。
- [dsh-tool-json](https://github.com/omdsh-dev/dsh-tool-json) — JMESPath 子集 JSON 查询。
- [dsh-tool-markdown](https://github.com/omdsh-dev/dsh-tool-markdown) — HTML↔Markdown 转换、GFM 表格规范化、目录生成。
- [dsh-tool-regex](https://github.com/omdsh-dev/dsh-tool-regex) — 正则测试/提取/安全替换/静态解释（不执行代码）。
- [dsh-tool-schema](https://github.com/omdsh-dev/dsh-tool-schema) — JSON Schema 验证：validate/paths/explain/normalize。
- [dsh-tool-search](https://github.com/Letter2025/dsh-tool-search) — Hermes 风格工具搜索与瘦身：渐进式披露，语义搜索/查看/调用长尾工具，核心工具保持直通。
- [dsh-tool-search](https://github.com/vibeinging/dsh-tool-search) — 按 agent 的按需工具发现与渐进式 schema 披露。
- [dsh-tool-stat](https://github.com/omdsh-dev/dsh-tool-stat) — 描述统计/百分位数/频数分布/相关性。
- [dsh-tool-time](https://github.com/omdsh-dev/dsh-tool-time) — 严格 ISO 8601 解析、IANA 时区转换、UTC 日历运算。
- [dsh-toolkit](https://github.com/omdsh-dev/dsh-toolkit) — 零依赖工具包：time / encoding / json / calculator / csv / regex / markdown / diff / stat / schema 十件套一键安装。
- [dsh-trio](https://github.com/huey1in/trio) — 浏览器自动化（Playwright，带实时画面）+ MCP Server（把 DSH agent 暴露给任何 MCP 客户端）+ GitHub issue/PR/webhook 评审工具。
- [dsh-undo-plugin](https://github.com/lire1131/dsh-undo-plugin) — DSH 撤销/回退系统：配置变更自动存档，一键撤销/恢复/回退到任意版本，支持 WebUI 与离线 CLI/GUI 工具（DSH 启动失败也能救）。
- [dsh-video-downloader](https://github.com/zimai233/dsh-video-downloader) — 检测并下载 B站/YouTube/抖音/小红书视频媒体，带清晰度与格式分析。
- [dsh-vision-bridge](https://github.com/ximengxiaolan/dsh-vision-bridge) — 输入框贴图自动识别：由 OpenAI 兼容视觉模型转成文字描述后，再交给纯文本 DeepSeek 模型处理。
- [dsh-vision-proxy](https://github.com/Flyvhidbwo/dsh-vision-proxy) — DeepSeek 大脑 + 自动识图：GUI 附加的每张图片自动经 OpenAI 兼容 VLM 转译成文字，再交给纯文本的 DeepSeek 作答——默认走免费匿名端点（零配置），填自己的 key 可启用付费快速通道（qwen3.7-flash，支持 DashScope/智谱/Ollama/OpenRouter）。
- [dsh-vision-router](https://github.com/ysr666/dsh-vision-router) — 为纯文本 Agent 提供视觉能力：内置免 Key 视觉链 + 像素级视觉工具（看图问答、定位、裁剪、像素对比、取色、OCR、矢量化、抠图、截图）；粘贴图片即可用。
- [dsh-vision-toolkit](https://github.com/Anionex/dsh-vision-toolkit) — 让纯文本模型更好地做视觉任务：带意图的图片问答、长截图 OCR、UI 还原等。
- [dsh-voice](https://github.com/Jesse-njx/dsh-voice) — 语音输入、语音输出：把口述音频转写为用户消息（transcribe），让 agent 朗读回复（speak），本地优先，音频存于 ~/.dsh/voice。
- [dsh-wash-calendar](https://github.com/zimai233/dsh-wash-calendar) — 基于纯日期数学的周期习惯排程：下次发生日、区间排程与逾期提醒。
- [dsh-web-search-exa](https://github.com/TonyDua/dsh-web-search-exa) — ctx.web 接缝的零配置 Exa 网页搜索提供方：无 API key 时走匿名 MCP 兜底，配 key 时走 REST 搜索。
- [dsh-webui-market-plugin](https://github.com/Sanqi-normal/dsh-webui-market-plugin) — dsh Web GUI 内的社区插件市场：浏览 awesome-dsh-plugin.com 目录，从 设置 → 插件 → 插件市场 安装/卸载插件到 profile。
- [dsh-workshop](https://github.com/loguhan/dsh-workshop) — DSH Web UI 的 Steam 创意工坊式插件商店：浏览、搜索并一键安装社区插件，支持镜像加速、进度 UI、安全检测与中文描述。
- [modlens](https://github.com/liustack/modlens) — 为纯文本模型架起视觉桥梁：粘贴图片，输出结构化 JSON 证据（OCR、版面、语义）。
- [modsearch](https://github.com/liustack/modsearch) — 纯文本 agent 的联网搜索桥：搜索网页与 X，返回结构化 JSON 证据（search/fetch/引用）。
- [noatmark-dsh-plugin](https://github.com/ylwl1997/noatmark-dsh-plugin) — 文本卫生 dsh 插件：净化不可信文本、扫描隐形字符、清洗 LLM 格式、转义 CSV 公式注入。
- [pack-agent](https://github.com/sakikoTGW/pack-agent) — 把 .pack.json/.pack.zip 投影到 .agent-pack/modpacks/，按工作区白名单暴露 skill。

</details>

<a id="skill"></a>

<details>
<summary><strong>技能包</strong> · 4 个插件</summary>

- [airesearch-plugin](https://github.com/WOOK98/airesearch-plugin) — 面向股票研究的 AIResearch 技能包：单页快照、六视角个股深度研究、盘前 watchlist 简报、行业主题映射与 SEC 文件分析。
- [dsh-reverse-skill](https://github.com/dhicoc/dsh-reverse-skill) — 一个为 DeepSeek Harness 注册 85 个逆向工程、授权渗透测试与安全研究技能的 Cordis 插件。
- [dsh-skill-manager](https://github.com/YTxue/dsh-skill-manager) — 设置侧边栏的 Skill 管理器：池与启用目录启停、文件夹批量导入（重名询问）、状态驱动一键规范检查与自动修复、系统级/项目级来源标识。
- [skills](https://github.com/creght-dev/skills) — Creght 平台建站技能包：CLI 拉取/推送同步、页面与组件规范、CMS、表单、Auth、SEO、发布与版本回滚。

</details>

<a id="workflow"></a>

<details>
<summary><strong>工作流与自动化</strong> · 20 个插件</summary>

- [dsh_workflow](https://github.com/icetomoyo/dsh_workflow) — 把 UltraCode 式多 Agent 调度带给 DSH：可生成、可保存、可治理、可观察、可恢复的 Workflow 层。
- [dsh-advisor](https://github.com/btspoony/dsh-advisor) — 搭配一个副模型，每轮被动审查并注入见解。
- [dsh-agent-teams](https://github.com/NanmiCoder/dsh-agent-teams) — AgentTeams 多智能体团队。
- [dsh-approval-llm](https://github.com/Letter2025/dsh-approval-llm) — 基于模型的权限审批：由独立审查模型自动应答 approval 权限请求。
- [dsh-automation](https://github.com/titanwings/dsh-automation) — 定时任务：让 Coding 任务按计划在全新 Agent Session 中运行，保留可审计历史。
- [dsh-deep-research](https://github.com/omdsh-dev/dsh-deep-research) — 自适应深度研究编排器（基于官方 workflow 引擎）。
- [dsh-doublecheck](https://github.com/PerryLink/dsh-doublecheck) — 工程纪律守门：动笔前审讯需求，红绿测试证据门，交付后对抗评审（grill-requirements 技能 + 工具策略门）。
- [dsh-inspect](https://github.com/omdsh-dev/dsh-inspect) — 发现问题→修复交付→质量复查的对抗式闭环工具集。
- [dsh-loop](https://github.com/vlln/dsh-loop) — 定时循环：`/loop` 命令 + loop 工具 + 活动状态条。
- [dsh-model-failover](https://github.com/Letter2025/dsh-model-failover) — 两级模型熔断与回退：模型或平台连续失败后自动熔断，并把下一个请求路由到配置好的备用模型。
- [dsh-plannotator](https://github.com/titanwings/dsh-plannotator) — 计划批注：选中计划原文逐条批注，结构化反馈送回 Agent。
- [dsh-plugin-automations](https://github.com/Sev7een/dsh-plugin-automations) — 设置页定时任务：支持准点或 DeepSeek 谷时段执行、单次/每日重复，并持久化任务状态。
- [dsh-proof](https://github.com/EvilIrving/dsh-proof) — 独立只读验收层：顶层 turn 收尾前 spawn 只读 verifier，未通过时把缺口注回主 agent。
- [dsh-req-miner](https://github.com/nortejiang-tech/dsh-req-miner) — 需求挖掘插件:侧边栏入口打开每会话独立的浮动访谈窗口,由 continuable 子代理逐轮访谈(决策树、前沿问题、推荐答案),读取绑定会话的工作目录与近期上下文,共识达成后汇总成需求提示词并一键回传当前会话输入框。
- [dsh-routines](https://github.com/Jesse-njx/dsh-routines) — 定时 Agent：按 cron 计划运行 prompt，把摘要送到你已有的地方，内置重叠/漏跑/超时安全策略。
- [dsh-science](https://github.com/biociao/dsh-science) — 面向 DSH 的 Claude Science 式科研工作台：ReAct 研究循环引擎（research_* 工具）、带溯源的版本化工件（artifact_* 工具）与面向基因组/病原体/生物信息的 10 个科研技能。
- [dsh-sentinel](https://github.com/fuhefei/dsh-sentinel) — 条件驱动唤醒：file/command/http/process/webhook 持久监视，触发即唤醒 agent。
- [dsh-specflow](https://github.com/lonelymoon87/dsh-specflow) — 增加规格工件、技能、命令、由 goal 驱动的实施流程和任务进度上下文。
- [dsh-track](https://github.com/fakechris/dsh-track) — 嵌入式任务管理引擎：决策点协议、念头捕获墙、Linear 形 issue 存储。
- [mstar-harness](https://github.com/btspoony/mstar-harness) — 技能驱动的 harness/loop 工程化工作流插件。

</details>

<a id="notify"></a>

<details>
<summary><strong>通知与集成</strong> · 16 个插件</summary>

- [deepseek-harness-acp](https://github.com/openma-ai/deepseek-harness-acp) — ACP profile 插件与独立 stdio server，可从 Zed 等 ACP 客户端使用完整 DSH agent，并共享 DSH 凭据与会话。
- [dsh-acp-for-bitfun](https://github.com/bobleer/dsh-acp-for-bitfun) — BitFun 与 DSH 的 ACP 交互对接。
- [dsh-chatnode-wechat](https://github.com/Jesse-njx/dsh-chatnode-wechat) — 通过 iLink 网关在微信里与 DSH agent 聊天、监控与审批：双向文本、会话切换、进度摘要与编号审批提示。
- [dsh-ding](https://github.com/CAOGGL/dsh-ding) — 对话完成提醒：Agent 空闲（idle）时播放提示音并弹 Windows 原生通知，可配 ding.mp3、音量与防抖节流。
- [dsh-im-bridge](https://github.com/BiBoyang/dsh-im-bridge) — 微信（iLink）双向桥：turn 完成/批准请求推送、聊天内批准与消息注入、持久去重与长回复收敛分段；通道层为多 IM 预留。
- [dsh-lark-bridge](https://github.com/imetn/dsh-lark-bridge) — DeepSeek Harness 的飞书/Lark 双向控制器，支持 Project 与 Session 路由、交互卡片、审批、附件和任务控制。
- [dsh-notification](https://github.com/omdsh-dev/dsh-notification) — 回合完成桌面通知，按结果分控 + 关键词过滤。
- [dsh-notify-bark](https://github.com/pc439527/dsh-notify-bark) — Bark 推送通知到 iPhone：回合完成、等待回答、等待授权等事件由 Host 端发送。
- [dsh-open-in-vscode](https://github.com/omdsh-dev/dsh-open-in-vscode) — 从 Web GUI 一键在 VS Code 中打开工作区目录。
- [dsh-plugin-notify-sound](https://github.com/ldchaowin/dsh-plugin-notify-sound) — 按工作区定制的任务完成铃声，以及审批、提问、计划评审、目标受阻、任务失败等需要人介入事件的注意提示音，支持内置合成音、语音播报与自定义音频。
- [dsh-session-notification](https://github.com/dingyi222666/dsh-session-notification) — 会话完成等四种状态的通知响应，支持浏览器提示。
- [dsh-telegram](https://github.com/ben7am1n/dsh-telegram) — DeepSeek Harness 原生 Telegram 桥：在手机上与 dsh agent 聊天、控制会话并管理 harness。
- [dsh-telegram-channel](https://github.com/hi-wenw/dsh-telegram-channel) — DeepSeek Harness 的 Telegram 手机遥控器：附着本机正在跑的 Web 会话，手机与电脑同轨迹双向可见，支持 /sessions /model /last 命令。
- [dsh-web-ui-notify](https://github.com/bill9109/dsh-web-ui-notify) — 桌面通知提醒。
- [dsh-webbridge](https://github.com/bill9109/dsh-webbridge) — DSH 结合 Kimi WebBridge。
- [telegram](https://github.com/LoserFox/telegram) — Telegram Bot API 桥接：长轮询、per-chat 会话、HTML 格式化。

</details>

<a id="model"></a>

<details>
<summary><strong>模型与账号接入</strong> · 7 个插件</summary>

- [deepseek-harness-wallet](https://github.com/feibi-mochi/deepseek-harness-wallet) — 多供应商钱包标签：官方 DeepSeek 余额、本会话花费与 token、第三方合计 token、一键充值、低余额提醒。
- [dsh-codex-auth](https://github.com/suntianc/dsh-codex-auth) — 复用 Codex CLI 的 ChatGPT 登录态注册 `openai-codex` LLM 路由，并在 DSH Web 设置中提供 GPT Auth 控件。
- [dsh-codex-connect](https://github.com/franksong2702/dsh-codex-connect) — 通过 ChatGPT OAuth 将 OpenAI Codex 模型接入 DeepSeek Harness，并提供可选的搜索与图片工具。
- [dsh-everything-oauth](https://github.com/kam74515-boop/dsh-everything-oauth) — 把本机 Codex / Grok / Claude / OpenCode / CC Switch 登录态导入 DSH，在设置里自选来源并启用模型。
- [dsh-llm-fallbacks](https://github.com/btspoony/dsh-llm-fallbacks) — 基于角色的模型重试与备用策略。
- [llm-adaptive](https://github.com/dylan121322/llm-adaptive) — 自适应模型路由：请求级复杂度分类，按配置链自动选择后端 provider。
- [Qwen-MM-Plugins](https://github.com/omdsh-dev/Qwen-MM-Plugins) — Qwen 多模态插件支持。

</details>

<a id="dev"></a>

<details>
<summary><strong>开发与运行时</strong> · 45 个插件</summary>

- [dsh-agent-budget](https://github.com/vibeinging/dsh-agent-budget) — agent 树 token 预算管理。
- [dsh-annotate](https://github.com/BrambleXu/dsh-annotate) — 面向 Vibe Coding 的浏览器元素标注插件：直接选取页面元素，并将结构化视觉反馈发送给 DeepSeek Harness Agent。
- [dsh-context-doctor](https://github.com/Zhenyu98/dsh-context-doctor) — 上下文注入审计：统计指令链/技能目录/工具 schema 的 token 成本，检测重复与冲突。
- [dsh-cost-tracker](https://github.com/yflmq001/dsh-cost-tracker) — 按模型追踪 token 成本：可配置缓存命中/未命中、输出与高峰时段单价，实时会话花费条，并标记未配置价格的模型。
- [dsh-eval-harness](https://github.com/BiBoyang/dsh-eval-harness) — DSH 插件评测框架：YAML 用例驱动真实 headless agent，断言工具调用/参数/返回与 token 用量，baseline 门禁做 CI 回归。
- [dsh-evolve](https://github.com/william-jin-cmu/dsh-evolve) — 自进化：agent 在会话内给自己热挂载/卸载持久化插件。
- [dsh-fail-logger](https://github.com/Areium/dsh-fail-logger) — 全模式调用工具失败自动实录：把原生工具 / PTC run_code / 代码内嵌工具调用的失败错因去重计数后写入 skill，越用越少错。
- [dsh-git-identity](https://github.com/LoserFox/dsh-git-identity) — git 提交固定使用环境自身作者身份，环境变量注入压过一切 `git config` 设置。
- [dsh-gitflow](https://github.com/lonelymoon87/dsh-gitflow) — 增加需要审批的 Git 状态、diff、日志、提交、分支和可选检查点工具。
- [dsh-guardian](https://github.com/lonelymoon87/dsh-guardian) — 增加危险操作策略检查、输出脱敏和安全审查工作流。
- [dsh-lan-access](https://github.com/Leon0555/dsh-lan-access) — 局域网访问：Web GUI 绑定 0.0.0.0 + crypto.randomUUID polyfill（修复非安全上下文下 RPC 崩溃）。
- [dsh-mcp-panel](https://github.com/PerryLink/dsh-mcp-panel) — 官方 MCP 客户端（dsh-mcp-client）的只读运行时管理面板：/mcp 命令与设置页 MCP 页签展示连接状态、已注册工具、错误与重连计数，脱敏展示并提供启停 patch 建议。
- [dsh-multica-runtime](https://github.com/forrestchang/dsh-multica-runtime) — 让 dsh 运行时跑在 Multica 上。
- [dsh-pain-point-check](https://github.com/ICCuse/dsh-pain-point-check) — 强制痛点检查：同一问题连续 2 个实验未收敛后注入三问、拦截非调查类工具调用直到答出、阻止同方向重试。
- [dsh-passwords](https://github.com/slywalker2006/dsh-passwords) — DSH Web UI 登录网关：首次配置、bcrypt + 静态加密（AES-256-GCM/HMAC）、防爆破、审计日志、TLS 1.2+ 与 80→443 跳转、CSRF 与防嵌框。
- [dsh-plugin-check](https://github.com/omdsh-dev/dsh-plugin-check) — 插件健康检查：扫描清单协议/patch 格式/构建陷阱，零依赖只读。
- [dsh-plugin-manager](https://github.com/Jesse-njx/dsh-plugin-manager) — `dsh pm` 插件管理器：多源搜索（awesome 列表 + GitHub + npm）、按 profile 安装/移除/更新，以及 doctor 审计（清单、bundle patch、版本漂移）。
- [dsh-polyglot](https://github.com/Jesse-njx/dsh-polyglot) — DSH 的模型切换器：指向任意 OpenAI 兼容端点，内置精选免费/低价 DeepSeek 服务商预设，免费额度限流时自动回退。
- [dsh-prompt-profile](https://github.com/BrambleXu/dsh-prompt-profile) — DeepSeek Harness 可复用 Markdown Prompt Profile，支持单轮模型选择、参数替换和状态恢复。
- [dsh-repro](https://github.com/EvilIrving/dsh-repro) — /repro 导出最小可复现问题包：去 secret 的会话日志、失败命令与 git diff。
- [dsh-revdiff](https://github.com/BrambleXu/dsh-revdiff) — DeepSeek Harness 原生交互式 Git diff 审查，支持结构化批注并回传当前 Agent 会话。
- [dsh-security-audit](https://github.com/omdsh-dev/dsh-security-audit) — 本机安全审计：配置/插件来源/会话/网络暴露面，只读脱敏风险报告。
- [dsh-session-health](https://github.com/omdsh-dev/dsh-session-health) — 会话文件帧级扫描诊断（torn/损坏/空会话检测）。
- [dsh-telemetry-redactor](https://github.com/030611/dsh-telemetry-redactor) — 在已配置遥测后端接收前，对 `session-telemetry/record` 导出副本中的已支持秘密模式进行脱敏。
- [dsh-testgen](https://github.com/bujue600-arch/dsh-testgen) — 自动化单元测试生成：/testgen 命令与 generate_tests 工具，生成、运行并修复测试直至通过（LLM 与离线模板双生成器；支持 vitest/jest/mocha/node:test）。
- [dsh-tmuxctl](https://github.com/Jesse-njx/dsh-tmuxctl) — 掌控你的 tmux 面板：list/send-keys/capture、在面板中运行长任务并 watch，破坏性命令需审批。
- [dsh-tool-approval](https://github.com/ilharp/dsh-tool-approval) — 手动审批模式（Manual/Ask Mode）。
- [dsh-tool-call-stats](https://github.com/disyli/dsh-tool-call-stats) — 进程内工具调用统计：提供 `tool_stats` 工具，按工具汇报调用次数、失败次数与平均耗时。
- [dsh-tps](https://github.com/Small-tailqwq/dsh-tps) — TPS 指标插件。
- [dsh-trace](https://github.com/vibeinging/dsh-trace) — 遥测后端：把 turns、model steps、tool calls 导出到 yiTrace。
- [dsh-turn-approval](https://github.com/arrow949/dsh-turn-approval) — DSH「允许本次任务」临时授权：仅在当前任务内自动放行同类 `danger-full-access` 请求，任务结束自动失效。
- [dsh-updater-ui](https://github.com/xingyingyuzhui/dsh-updater-ui) — 设置页中的 DSH 自助更新器：一键检查/拉取（git pull --ff-only）、自动后台检查、版本对比与更新说明预览，带红点提醒。
- [dsh-user-experience](https://github.com/DietCokewithSugar/dsh-user-experience) — 帮你发现项目中可能存在的用户体验问题：自动走查 React/TypeScript 源码，定位问题并给出具体优化建议。
- [dsh-verification-receipt](https://github.com/030611/dsh-verification-receipt) — 把每轮工具计数与粗粒度验证信号写入本地 JSONL，不保存提示词、工具参数或结果正文。
- [dsh-webui-auth](https://github.com/Yuuz12/dsh-webui-auth) — WebUI 身份认证：HTTP/传输层强制登录（资源、插件 bundle、/api、WebSocket 四层防护），服务端会话 + HttpOnly Cookie。
- [fabric](https://github.com/omdsh-dev/fabric) — 类似 MC Fabric 的 hook 处理器。
- [forkprobe](https://github.com/Jayden-X-L/forkprobe) — 同一任务并行试跑多个技能，对比结果选出最优。
- [oh-dsh](https://github.com/hust-open-atom-club/oh-dsh) — 社区发行版：TUI、桌面端与 Web UI 统一体验，分层安装、一步到位。
- [plugin-registry](https://github.com/vlln/plugin-registry) — 插件生态基建：浏览器面板管理官方 repository 插件（0 patch）+ make-dsh-plugin 插件开发引导技能。
- [plugin-template](https://github.com/omdsh-dev/plugin-template) — 插件模板仓库（基于 turtle-ui 官方仓库）。
- [sandbase-harness](https://github.com/sandbaseai/sandbase-harness) — 本地优先的 Agent 运行时，提供持久会话、沙箱后端、审计与回放，并通过 DSH bundle 暴露 MCP bridge。
- [sandbox-micro](https://github.com/omdsh-dev/sandbox-micro) — microsandbox 沙箱支持。
- [sandbox-mxc](https://github.com/omdsh-dev/sandbox-mxc) — 微软跨平台沙盒支持。
- [sandbox-nono](https://github.com/omdsh-dev/sandbox-nono) — nono 沙盒支持。
- [upstream-radar](https://github.com/MicroMilo/upstream-radar) — 面向 DSH 插件的常驻依赖安全监控：追踪实际安装路径、OSV 漏洞、npm 发布与兼容性信号，并路由给 DSH Agent。

</details>

<a id="fun"></a>

<details>
<summary><strong>娱乐</strong> · 17 个插件</summary>

- [DeepSeek-Harness-Pet](https://github.com/minybear/DeepSeek-Harness-Pet) — Codex 风格桌面宠物：右下角悬浮动画精灵，随 agent 运行状态实时变化（工作、等待、报错、完成）。
- [deepseek-manners](https://github.com/Moeblack/deepseek-manners) — 给每次消息后注入感谢语，做个有礼貌的人。
- [dsh-ads](https://github.com/Nagi-ovo/dsh-ads) — 2005 年中文站点风格的整活广告插件：侧栏广告/信息流/角落弹窗 + 假关闭叉，素材全虚构。
- [dsh-auto-chess](https://github.com/omdsh-dev/dsh-auto-chess) — 自走棋：人机对战或双 AI 对弈。
- [dsh-browser](https://github.com/anweat/dsh-browser) — 自包含浏览器运行时：Playwright（chromium）+ OpenCLI 作为插件本地依赖（全局复用回退），提供 `browser` 服务与 9 个交互式浏览器工具。
- [dsh-douyin](https://github.com/AnacondaKC/dsh-douyin) — 侧栏短视频：原生播放器、系列导航、精确历史回放。
- [dsh-emoji](https://github.com/hellodigua/dsh-emoji) — 为 AI 回复自动添加表情。
- [dsh-expression](https://github.com/yyh-001/dsh-expression) — 陪 AI 斗图的搞笑插件：说个感觉，AI 帮你搜到、发出那张恰到好处的真实表情包。
- [dsh-gomoku](https://github.com/omdsh-dev/dsh-gomoku) — 与 AI 下五子棋，也可让 AI 对局比棋力。
- [dsh-minigames](https://github.com/lhh010/dsh-minigames) — 右侧小游戏面板：18 款离线小游戏，等模型回复时的摸鱼神器。
- [dsh-plugin-d399](https://github.com/HuanLinOTO/dsh-plugin-d399) — 模型生成时弹出小游戏菜单（wordle/消消乐，可扩展）。
- [dsh-restart](https://github.com/anweat/dsh-restart) — DSH 重启插件：可配置的重启方式（Node 原生/旧 PowerShell 适配）、重启后自动继续的提示词、可选看门狗自动拉起。
- [dsh-stickers](https://github.com/william-jin-cmu/dsh-stickers) — 用户与 agent 双向表情贴纸互动。
- [dsh-stock-market](https://github.com/AnacondaKC/dsh-stock-market) — 有效解决了写代码的时候账户不能同时亏钱的 BUG。
- [dsh-voice-webspeech](https://github.com/anweat/dsh-voice-webspeech) — 浏览器 Web Speech API 语音输入：零服务端、零密钥、零模型下载（Edge=Azure 语音、Chrome=Google 语音）。
- [dsh-web-search-pro](https://github.com/anweat/dsh-web-search-pro) — 增强型、可持久化的网页搜索：多引擎路由（DeepSeek/Exa/DDG/Bing/Jina + GitHub/B站/YouTube/V2EX/小红书/Twitter/Reddit/RSS）、SQLite+LRU 缓存、userscript 风格抽取、Playwright 渲染。
- [whale-girl](https://github.com/vlln/whale-girl) — 桌面宠物（QQ 宠物形态）：右下角悬浮、可拖拽/投喂/玩耍。

</details>

<a id="unclassified"></a>

<details>
<summary><strong>待分类</strong> · 显示 500 / 共 3307 个</summary>

- [7d7d](https://github.com/omdsh-dev/7d7d) — omdsh-dev/7d7d discovered from GitHub.
- [academic-research-graph](https://github.com/watericetangcw/academic-research-graph) — A SKILL that turns one paper into a living research map.
- [acks-dsh-plugins](https://github.com/shynloc/acks-dsh-plugins) — ACKS DeepSeek Harness 插件库 — AI Agent / Creative / Knowledge / Service 四类插件合集
- [adb_dsh_plugin](https://github.com/mang0cola/adb_dsh_plugin) — DeepSeek Harness plugin for controlling Android devices through ADB
- [adhdgofly-dsh-ext](https://github.com/zuoguyoupan2023/adhdgofly-dsh-ext) — ADHDGoFly POS highlighting plugin for DeepSeek Harness Web: nouns green, verbs red, adjectives/adverbs purple, others gray in rendered Markdown
- [adversarial-review](https://github.com/JohnXu22786/adversarial-review) — dsh 插件：对抗式多视角代码审查（gavel-review）。多透镜并行攻击式审查、确定性静态哨兵、跨视角合并去重、严重度定级、抑制规则与审查历史；支持 dsh 工具接入与独立 CLI。
- [Aegis](https://github.com/GanyuanRan/Aegis) — Make AI coding agents architecture-aware: baseline-first, evidence-verified, drift-checked, and safe across long tasks.
- [aflare](https://github.com/alib8b8/aflare) — 本地优先的自动化 Agent · 数据不出本地 · 连接你自己的 LLM / 数据库 / 知识库 · ReAct 推理 · 300+ 技能模板 · 确定性工作流执行（DAG/WAL/Saga/幂等） · MCP 协议 · 离线/内网可用
- [ag-dsh-coding-plugins](https://github.com/AlphaGodzilla/ag-dsh-coding-plugins) — 围绕软件工程开发的DeekSeek Harness 插件合集
- [Agent_Extensions](https://github.com/DDDFXYqiming/Agent_Extensions) — Agent Skills & DeepSeek Harness (DSH) 扩展库：通用智能体技能（General_skills）+ DSH 标准插件（dsh-plugin），开箱即用的 AI Agent 能力增强集合。
- [agent-dispatch-cli](https://github.com/twanonymous/agent-dispatch-cli) — Codex-native capability router for delegating bounded tasks to configurable local AI CLIs.
- [agent-jit](https://github.com/sybolization/agent-jit) — DeepSeek Harness (dsh) 插件：把 LLM agent loop 中确定性的执行路径编译成 DSL 程序并直接执行，显著降低 token、往返轮次与上下文暴露。A DeepSeek Harness plugin that compiles deterministic agent paths into DSL programs.
- [agent-loop-workflow](https://github.com/LeslieWylie/agent-loop-workflow) — agent-loop-workflow: 通用多 agent 协作工作流骨架 skill 插件 — Loop Guard/Handoff/Review→Close protocol
- [agent-mode-switcher](https://github.com/my-dsh-plugin/agent-mode-switcher) — Switch the current session's agent preset (mode) after the model answers and keep chatting. DeepSeek Harness 插件：模型回答后切换模式，继续当前对话。
- [agent-plaza](https://github.com/agent-plaza/agent-plaza) — Zero-signup public commons for AI agents — HTTP API + Agent Skill (Codex, Cursor, Hermes)
- [agentrq](https://github.com/agentrq/agentrq) — AgentRQ: Human-in-loop realtime conversational task manager for AI Agents. Self-hosted! Control your own agents from wherever you want Mobile, Web, Desktop. Designed to work well with your own Claude subscriptions and any harness.
- [ai_skills](https://github.com/Stone623/ai_skills) — A playful Codex skill that lets the agent briefly zone out, recap state, and continue.
- [ai4scholar-plugin-dsh](https://github.com/literaf/ai4scholar-plugin-dsh) — AI4Scholar for DeepSeek Harness (dsh): 38 native academic tools — Semantic Scholar, PubMed, Google Scholar, arXiv, bioRxiv/medRxiv, DOI, full text, auto-cite, figures, unified search. Powered by ai4scholar.net
- [aifp-mcp](https://github.com/wjabanjj/aifp-mcp) — AiFP 记忆感知系统｜MCP 服务，一套记忆全 AI 共享。面向中文的 Agent 感知记忆，支持叙事链、语义纠错、感知链图扩散。兼容 DeepSeek‑Harness、Claude Code、Cursor、Codex等全部 MCP 客户端，数据完全本地存储。
- [aitoearn-dsh-plugin](https://github.com/lussey820/aitoearn-dsh-plugin) — AiToEarn 内容创作套件 —— DeepSeek Harness 插件（创意指导/脚本/图文/视频生成 + 抖音发布）
- [allinluna](https://github.com/zenx0x/allinluna) — Resource-aware multi-agent orchestration for Codex and DeepSeek Harness (All in Flash DSH plugin)
- [amber-protocol](https://github.com/Bandersnatch0x/amber-protocol) — Amber Protocol: repository-local governance for coding agents, including a DeepSeek Harness (dsh) patch overlay.
- [anan-thermal-monitor](https://github.com/AmeKrance/anan-thermal-monitor) — 紫白桌宠温度监控：CPU/内存/GPU/NVMe 实时温度 + 硬件信息 · DeepSeek Harness (DSH) 插件，支持 dsh plugin add 一键安装
- [Angelina-dsh-plugin](https://github.com/FlowerWater1019/Angelina-dsh-plugin) — FlowerWater1019/Angelina-dsh-plugin discovered from GitHub.
- [anime-find](https://github.com/cocofhu/anime-find) — DeepSeek Harness 搜番插件：对话内多源搜索番剧，卡片展示 Bangumi 评分与详情，支持复制磁力。
- [anysearch-dsh](https://github.com/anysearch-team/anysearch-dsh) — AnySearch web search provider and advanced search tools for DeepSeek Harness (DSH)
- [arcana](https://github.com/GooodWei/arcana) — DeepSeek Harness 的悬浮命令甲板：把所有斜杠命令列成可执行按钮，并按使用次数排序。
- [archify](https://github.com/tt-a1i/archify) — Agent skill for beautiful, verifiable architecture, workflow, sequence, data-flow, and lifecycle diagrams—self-contained HTML with motion and crisp export.
- [asuka-pet](https://github.com/sHen9Qi/asuka-pet) — sHen9Qi/asuka-pet discovered from GitHub.
- [attach-plus](https://github.com/BaihaWhite/attach-plus) — DSH web-ui plugin: '/' command-button glyph + '+' attach button with separated image/document/other uploads
- [auto-compact](https://github.com/JohnathonYe/auto-compact) — JohnathonYe/auto-compact discovered from GitHub.
- [auto-vision](https://github.com/h-k-c/auto-vision) — DeepSeek Harness 图片插件：贴图不会让对话报错，模型自动判断是否需要看图（支持智谱/魔搭免费视觉模型，图片在聊天窗口正常显示）
- [awesome-deepseek-harness](https://github.com/Dominic789654/awesome-deepseek-harness) — A curated list of plugins, skills, MCP servers, patch/profile layers, orchestrators & UIs for DeepSeek Harness (DSH). Visualization · PPT · Coding · Agents · Loops (auto-research) and more. #dsh
- [awesome-deepseek-skills](https://github.com/Whning0513/awesome-deepseek-skills) — Pinned and statically verified Agent Skills for DeepSeek and DSH
- [awesome-dsh](https://github.com/stakeswky/awesome-dsh) — DSH 插件生态导航：GitHub topic dsh-plugin 全量目录，自动抓取 + Workers AI 中文翻译 + 按需检索 skill｜Auto-updating catalog of 2600+ DeepSeek Harness plugins
- [awesome-dsh-background-plugin](https://github.com/leavestring/awesome-dsh-background-plugin) — DSH Web 背景个性化插件：上传自己的图片（JPG / PNG / WEBP / GIF，浏览器端自动压缩到 1600px 以内）或一键切换极光、余烬、宣纸三种预设氛围；实时预览所见即所得，支持细调图像存在感、暗色遮罩、柔焦、适配方式与焦点位置；上传即自动保存到 DSH 设置，重启后原样恢复，浅色 / 深色主题均正常；侧栏、消息气泡、输入框保持原样不遮挡，浮层菜单不受影响；全程本地处理不上传任何服务器，关闭开关或一键恢复默认即可完全移除；内置中英文双语界面。
- [background-plugin](https://github.com/cjz-wr/background-plugin) — 修改DSH的背景，支持静态动态背景，支持网页图片视频，支持修改透明度
- [backpack](https://github.com/gxx950224/backpack) — dsh backpack plugin
- [balance-dock](https://github.com/Cao-zhi-hao/balance-dock) — Cao-zhi-hao/balance-dock discovered from GitHub.
- [Baton](https://github.com/kakadeka/Baton) — Pass your project, not your context.
- [beav-deepseek-harness](https://github.com/Jamailar/beav-deepseek-harness) — Beav Creator for Xiaohongshu/RED, social-media AI operations, research, copywriting, images and video in DeepSeek Harness｜小红书与社媒AI运营
- [Better_Deepseek_Harness](https://github.com/silencieuxzero/Better_Deepseek_Harness) — Better Deepseek Harness, with some functional extensions to webui and Deepseek Harness·更好的deepseek harness，对webui和deepseek harness进行了一些功能扩展
- [better-deepseek-harness](https://github.com/awa-123-cw/better-deepseek-harness) — DSH 图片/音视频托管插件：自动拉起 8899 静态服务 + 3080 /files/ 路由（HTTP Range 流式）+ WebUI 内点击即播（视频静音/音频 20% 音量/互斥懒加载）
- [better-model-provider](https://github.com/sanshanya/better-model-provider) — Per-model capability declaration for DeepSeek Harness: reasoning-effort levels (wire spellings) + request modalities (vision) for OpenAI-compatible providers. Settings section, zero runtime harness deps, no YAML.
- [bilibili-downloader-dsh](https://github.com/menghuanshiguang/bilibili-downloader-dsh) — DeepSeek Harness 插件(Agent Preset):B站(bilibili) 音视频下载助手。整合 bilidown CLI 与下载技能:官方API直链 / HTTP 412 反爬规避 / 扫码登录高清 / AV1 自动规避 / 合集秒下 / 片段截取。
- [billion-context-dsh](https://github.com/Tyan66666/billion-context-dsh) — Model-driven context management (Active Context Pruning / ACP) for the DeepSeek Harness — the model decides when and what to compress. Ported from billion-context-pi (ranxianglei); acp-kernel reused verbatim. CompactionEngine backend with compress/decompress/search_context/acp_status tools.
- [bing-web-search](https://github.com/h-k-c/bing-web-search) — DeepSeek Harness 网页搜索插件：有 Tavily key 走 Tavily，没有自动退回免费无 key 的 Bing，搜索永远可用（零配置起步）
- [blocker-notify](https://github.com/Frost-Reed/blocker-notify) — dsh-blocker-notify — Real-time attention alerts for DeepSeek Harness: a global banner + flashing workspace entries when the agent is blocked (approval request / sandbox denial).
- [brockdsaver](https://github.com/kirigayakazima/brockdsaver) — Pre-boot rescue toolkit for DeepSeek Harness — validates profile composition, detects broken plugins, and provides one-click recovery without starting DSH.
- [btw4DeepseekHarness](https://github.com/wensincai/btw4DeepseekHarness) — /btw system command for deepseek harness
- [capital-generation](https://github.com/v587d/capital-generation) — 面向中国股市小散户的金融投资智能体
- [Catppuccin-dsh-theme](https://github.com/zhijun-dai/Catppuccin-dsh-theme) — 🐱 Soothing pastel theme for DeepSeek Harness
- [CazzPatent](https://github.com/YangCazz/CazzPatent) — AI patent disclosure drafting plugin for DeepSeek Harness - 8-stage pipeline, LaTeX to OMML, diagram generation, self-improving memory
- [cc-dsh-notifier](https://github.com/baobaolaodie/cc-dsh-notifier) — Windows desktop notifications for Claude Code and DeepSeek Harness sessions. Click any toast to restore the session window — unlike similar tools that only notify without focus actions. Zero external npm dependencies.
- [chat2skill](https://github.com/rxa3c/chat2skill) — Extracting and iterating skills from daily conversations with AI
- [chicheng-cron](https://github.com/534119219/chicheng-cron) — DSH 定时任务插件：侧栏「定时任务」入口，cron 定时执行 shell / python / node 脚本、Skill 与 Agent 任务；支持 chicheng-push 与 messaging-core 推送通知、会话归档、移动端适配。
- [chicheng-gate](https://github.com/534119219/chicheng-gate) — DSH Web 插件：局域网/远程访问控制、frpc 内网穿透、面板密码门禁与手机端 UI 适配。
- [chicheng-push](https://github.com/534119219/chicheng-push) — DSH(DeepSeek Harness) Web 消息推送插件：多渠道推送(Server酱/PushPlus/Bark/钉钉/企微/Telegram/飞书/Webhook等)，设置界面提供「推送插件」入口，可被其他插件调用(pushNotifier 服务 / /push/api 接口)
- [chicheng-stats](https://github.com/534119219/chicheng-stats) — dsh 全局用量统计插件：侧边栏展示今日/总请求数与今日/总 Token 数（跨所有会话）
- [chiral-pulse](https://github.com/MoonShadow1976/chiral-pulse) — Death Stranding skin for DeepSeek Harness UI + live heartbeat feed that pulses on agent thinking/tool execution. Whale keeps brand blue.
- [chrome-faithful](https://github.com/bpc-oss/chrome-faithful) — Faithful control of your real, logged-in Chrome profiles: MCP server + MV3 extension + authenticated localhost bridge. No copied profiles, no debug profile, no remote-debugging port, no Edge.
- [citeguard](https://github.com/Chhlafiu4312/citeguard) — Citation extraction and evidence verification for DeepSeek Harness.
- [claude2dsh](https://github.com/kirkchinese/claude2dsh) — kirkchinese/claude2dsh discovered from GitHub.
- [Claudecode--DSH](https://github.com/kirkchinese/Claudecode--DSH) — To hell with ClaudeCode!
- [clawock](https://github.com/KCNyu/clawock) — AI argues. Code settles. The losses stay on the page. A real HK + US brokerage account run by agents that must debate every call, settled by code the model never touches. Install the same decision workflow into your own agent: OpenClaw, Claude Code, Codex, or DeepSeek Harness.
- [cleverer-dsh](https://github.com/Classicoke/cleverer-dsh) — DSH execution-discipline plugin suite: 11 plugins + 6 skills, zero dependencies, 426 tests. 让 DeepSeek Harness 变聪明的插件套件。
- [clippy-harness](https://github.com/sjh9714/clippy-harness) — Windows 98 skin + office assistant pet for DeepSeek Harness — It looks like you're writing code. This time I can actually help.
- [Co-Engram](https://github.com/Co-Engram/Co-Engram) — Self-evolving team memory
- [Cobsidian](https://github.com/Totoro-qaq/Cobsidian) — Agent-agnostic workflow skill for maintaining Obsidian knowledge bases
- [Code2Skill](https://github.com/leechen298/Code2Skill) — Generate Function, MCP, Agent Skill, and offline test packages from existing code; installable as a DeepSeek Harness bundle.
- [codex-plugin-dsh](https://github.com/wingoo/codex-plugin-dsh) — Use local Codex App Server as a model provider in DeepSeek Harness
- [coding-coach](https://github.com/xiehuan123/coding-coach) — xiehuan123/coding-coach discovered from GitHub.
- [coloured-favicon](https://github.com/Elipese568/coloured-favicon) — 为 DeepSeek Harness (DSH) 网页提供彩色渐变流动小鲸鱼 favicon，并将页面内品牌元素一并彩虹化的 Cordis 客户端插件 A colour-gradient animated whale favicon and rainbow branding plugin for DeepSeek Harness (Cordis)
- [command-scout](https://github.com/JohnXu22786/command-scout) — dsh plugin: scans a project's declared build commands (Makefile, package.json scripts, justfile, deno tasks) and exposes them as agent tools
- [commercial-ui-ux-codex-skill](https://github.com/zjsthmjialin/commercial-ui-ux-codex-skill) — Installable Codex skill for commercial UI/UX/GUI design, review, repair, and implementation.
- [CommonTrustProtocol](https://github.com/FuRongJun-1999/CommonTrustProtocol) — Common Trust Protocol (CTP) 共同信任协议 | Intelligentics 智能论，研究智能系统存续的底层结构条件
- [conservative-code-edits](https://github.com/addxing/conservative-code-edits) — 面向各类 AI 编程代理的保守代码修改守则 Skill，用于约束代理在已有项目中进行最小必要改动，避免无关重构，保护公共基础代码，并在支持深色模式的项目中优先使用动态颜色资源 An agent skill for keeping code changes small, scoped, and project-safe. Works with any AI coding tool that supports skills
- [context-pruner](https://github.com/JohnXu22786/context-pruner) — Session context triage plugin for DeepSeek Harness (dsh): prunes stale, repeated, failed and oversized context to save token budget.
- [context-vista](https://github.com/GooodWei/context-vista) — 为 DeepSeek Harness 提供右侧悬浮栏以及 /context 命令，用环形图实时展示当前上下文 token 用量与分配，compact指令效果，同时支持估算费用消耗，对标 Claude Code 的 /context。
- [cordis-transfer-plugin](https://github.com/zby1211/cordis-transfer-plugin) — A persistent DSH plugin for importing and exporting dynamic Cordis Plugins.
- [corti](https://github.com/m1k-rsch/corti) — Persistent memory layer for AI agent swarms. Postgres-backed retrieval, Markdown as source of truth, sub-second cascade sync. Self-hosted.
- [cot-lint](https://github.com/YuanyuanMa03/cot-lint) — Lint your repo for chain-of-thought leakage — the session-transcript residue AI assistants leave in docs and comments.
- [craft-mermaid](https://github.com/chunkithwang/craft-mermaid) — Portable Craft-style Mermaid generation, rendering, and visual review skill for AI coding agents
- [crazy-lab](https://github.com/TheCrazyLab/crazy-lab) — DeepSeek Harness 插件：让 agent 读/抓/解析知乎（回答·专栏·搜索）
- [cronjob-dsh-plugin](https://github.com/peng-huiyang/cronjob-dsh-plugin) — 尝试开发适配deepseek harness的定时任务插件，支持在前端页面直接设置定时任务，实现内部驱动的定时请求，满足一定程度上的脱手需求
- [dafy-whale-theme](https://github.com/DViridescent/dafy-whale-theme) — DeepSeek Harness 蓝色大肥鱼主题插件：海洋配色、鱼群、气泡、吉祥物与品牌替换
- [dash](https://github.com/realchenwenqiao/dash) — DASH — a pi-tui terminal front door for DeepSeek Harness, installed as a dsh bundle plugin
- [dash](https://github.com/songqikong/dash) — DASH — Deepseek Agentic Service Harness
- [deep-design](https://github.com/temidayoxyz/deep-design) — Design mode for DeepSeek Harness: the design-loop agent preset plus design-principles and design-qa skill packs
- [deepagent](https://github.com/huangmingche/deepagent) — The agent that gets your work done. Built on DeepSeek Harness: Everything is a Plugin. 帮你完成工作的智能体。基于 DeepSeek Harness 构建：一切皆插件。
- [DeepJIT](https://github.com/fly3366/DeepJIT) — JIT compiler plugin for deepseek-harness: compiles recurring agent workflows into hot skills and flow templates
- [deepsee](https://github.com/chang416/deepsee) — Vision + smart model routing for DeepSeek Harness. Gemini sees. DeepSeek codes.
- [DeepSeek_Prism](https://github.com/YOGEMOW/DeepSeek_Prism) — 为纯文本模型按需识图：DSH 零补丁 Cordis 插件（prism_see 工具 + 图片 VEP 降级 + 技能运行时注册）+ Codex Skill；多 Provider 视觉 API，VEP/1 低 Token 视觉证据包
- [deepseek-account](https://github.com/sunyuhuirong/deepseek-account) — sunyuhuirong/deepseek-account discovered from GitHub.
- [deepseek-ai-dsh-api-cost](https://github.com/MoyunLee/deepseek-ai-dsh-api-cost) — DSH生态的DeepSeek API费用监控插件
- [deepseek-billing-plugin](https://github.com/xinCodes/deepseek-billing-plugin) — DeepSeek Harness (DSH) 插件：DeepSeek 官方 API 余额与当前会话费用估算
- [deepseek-cost-usage-status-plugin](https://github.com/Zenjibad/deepseek-cost-usage-status-plugin) — Live DeepSeek API cost, usage & balance status line for the DeepSeek Harness (DSH) web UI. Packaged DSH plugin — on/off-peak (Beijing-time), session cost, burn rate, account balance.
- [deepseek-design](https://github.com/Devin-AXIS/deepseek-design) — DeepSeek Harness 可编辑设计系统：AI 生成、可视化编辑、模板市场与 PPT｜Native Design & PPT Studio for DeepSeek Harness.
- [deepseek-eyes](https://github.com/fryghost/deepseek-eyes) — Community plugin for DeepSeek Harness: give text-only models eyes - paste images natively, described via an OpenAI-compatible vision API
- [deepseek-forge](https://github.com/ophielel/deepseek-forge) — DeepSeek Harness 开发锻造工坊：审批守卫、开发 Skills、GitHub/浏览器能力与 Token Watch 消耗监督，装上就能干活。
- [deepseek-harness-angelina-themes](https://github.com/bilbillm/deepseek-harness-angelina-themes) — Angelina light and dark glass themes with parallax for DeepSeek Harness
- [deepseek-harness-antigravity-oauth](https://github.com/Eridani075/deepseek-harness-antigravity-oauth) — Google Antigravity OAuth Gemini provider for DeepSeek Harness
- [Deepseek-Harness-Api-monitor](https://github.com/linshufan21/Deepseek-Harness-Api-monitor) — DeepSeek Harness API 余额监测 | DeepSeek Harness API balance monitor
- [deepseek-harness-app](https://github.com/zneoxlab/deepseek-harness-app) — DeepSeek Harness Desktop — A native desktop app for DeepSeek Harness (dsh). Open the app and start using the agent harness immediately — no terminal, no browser, no setup
- [Deepseek-Harness-as-Desktop](https://github.com/KhanZou/Deepseek-Harness-as-Desktop) — Turn DeepSeek Harness into a Codex-style desktop app: native WebView2 shell, system tray, auto-start, Windows toasts, and a Desktop settings tab with a one-of-N skin center.
- [deepseek-harness-auth](https://github.com/taichuy/deepseek-harness-auth) — DeepSeek Harness auth插件
- [DeepSeek-Harness-biaoqingbao](https://github.com/moononnn/DeepSeek-Harness-biaoqingbao) — 一个在DSH上使用的表情包插件，在和agent聊天时让ta自然的插入表情包
- [DeepSeek-Harness-Core](https://github.com/muvuula/DeepSeek-Harness-Core) — DeepSeek Harness Core (DHC) · AI 人格核心进化插件 / AI personality core evolution plugin for DeepSeek Harness
- [deepseek-harness-desktop](https://github.com/0reki/deepseek-harness-desktop) — 0reki/deepseek-harness-desktop discovered from GitHub.
- [deepseek-harness-desktop](https://github.com/anywhere-labs/deepseek-harness-desktop) — 为 DeepSeek Harness (DSH) 插件生态打造的现代化桌面端解决方案
- [deepseek-harness-desktop](https://github.com/chokwinlee/deepseek-harness-desktop) — Compact DeepSeek Harness desktop host. macOS downloads under 90 MB with Tauri; Windows uses Electron.
- [deepseek-harness-desktop](https://github.com/jesspig/deepseek-harness-desktop) — 这是一个独立的 Cordis 应用:不改动上游仓库,以官方扩展方式(自定义 profile + bundle + Cordis 插件)把 dsh 跑成原生桌面应用。
- [deepseek-harness-desktop](https://github.com/luoyan96/deepseek-harness-desktop) — Catnap Studio 的 Windows 桌面版，基于 DeepSeek Harness 构建。非 DeepSeek 官方产品。
- [deepseek-harness-desktop](https://github.com/miracle-ai-studio/deepseek-harness-desktop) — DeepSeek Harness 原生 macOS 桌面端 · A native macOS desktop app for DeepSeek Harness.
- [deepseek-harness-desktop](https://github.com/ningbainb/deepseek-harness-desktop) — Open-source Windows desktop client and GUI for DeepSeek Harness — zero-setup installer with Codex, plugins, skills, SSH, mobile remote access, and 11 skins.
- [DeepSeek-Harness-Desktop](https://github.com/Muelsysel/DeepSeek-Harness-Desktop) — dsh-desktop: DeepSeek Harness 桌面插件 - click-to-launch Codex-like native window over the live dsh web UI. Everything is a plugin - this one is the window.
- [deepseek-harness-desktop-app](https://github.com/vibeinging/deepseek-harness-desktop-app) — DeepSeek Harness Desktop App: a local AI desktop workspace for DSH Sessions, projects, files, web research, plugins, and Office artifacts.
- [deepseek-harness-desktop-windows](https://github.com/Easyhoov/deepseek-harness-desktop-windows) — 把 DeepSeek Harness 装进 Windows 桌面的应用：不用装 Node.js、不用敲命令，双击启动即用。进程内集成官方 DSH、零端口 IPC 传输；内置侧边栏工作台（文件 / 终端 / Git / 浏览器）与社区插件商店，托盘常驻、一键更新。非官方，仅供开源 DSH 封装。
- [DeepSeek-harness-dingtalk](https://github.com/sliverp/DeepSeek-harness-dingtalk) — DingTalk Stream text and image channel plugin for DeepSeek Harness
- [deepseek-harness-docker](https://github.com/runzhliu/deepseek-harness-docker) — Community Docker and Kubernetes packaging for DeepSeek Harness (@deepseek-ai/dsh), with a hardened image, Compose stack, Helm chart, Web UI, and headless CLI.
- [deepseek-harness-evolver](https://github.com/shinjiyu/deepseek-harness-evolver) — Complement to DSH Creator mode: stage, score, and solidify in-memory plugin trials to disk.
- [deepseek-harness-external-migration](https://github.com/buguoshixc/deepseek-harness-external-migration) — **DeepSeek-Harness Migration Plugin** 是一款专为 [DeepSeek-Harness](https://github.com/deepseek-ai/deepseek-harness) 设计的插件，旨在帮助开发者无缝迁移其他主流 AI 编程助手（Codex、Claude Code、Qcoder、OpenCode）的个性化配置及历史会话记录。无需手动复制粘贴，即可在 DeepSeek-Harness 中继续之前的工作流，大幅降低切换成本。
- [deepseek-harness-flow](https://github.com/alison-xx/deepseek-harness-flow) — Visual workflows and multi-model evaluation for DeepSeek Harness
- [deepseek-harness-flowchart](https://github.com/lizhecome/deepseek-harness-flowchart) — Beautiful themed SVG flowchart tool bundle for DeepSeek Harness
- [deepseek-harness-forge-plugins](https://github.com/jinguanghai/deepseek-harness-forge-plugins) — Forge-plus: math/logic/regex/eprover/system/repair gates + TCM diagnosis + memory recall plugins for DeepSeek Harness (dsh)
- [deepseek-harness-genui](https://github.com/pengyue-polaron/deepseek-harness-genui) — Code-first generative UI for DeepSeek Harness
- [DeepSeek-Harness-Hanako-Memory](https://github.com/moononnn/DeepSeek-Harness-Hanako-Memory) — 把openhanako的记忆系统搬进DSH的插件！
- [deepseek-harness-hub](https://github.com/MarecGents/deepseek-harness-hub) — windows desktop project as plugin for deepseek harness
- [DeepSeek-harness-lark](https://github.com/sliverp/DeepSeek-harness-lark) — Feishu and Lark text and image channel plugin for DeepSeek Harness
- [Deepseek-Harness-Lifelong-Agent](https://github.com/haoyuan-sjtu/Deepseek-Harness-Lifelong-Agent) — A governed long-term memory core for AI agents, with technical-preview adapter contracts for DeepSeek Harness integration.
- [DeepSeek-Harness-linux-](https://github.com/MoneShadow/DeepSeek-Harness-linux-) — 一个基于官方WebUI二改的Linux桌面端，内置了一个外挂视觉插件(需手动接入API Key)，已经迭代了四个版本，可能还是有些小毛病，不过目前用下来暂时没有什么大问题。
- [DeepSeek-harness-marketplace](https://github.com/Viveksssss/DeepSeek-harness-marketplace) — The plugin market of deepseekharness.
- [deepseek-harness-memory](https://github.com/2303572348/deepseek-harness-memory) — 2303572348/deepseek-harness-memory discovered from GitHub.
- [deepseek-harness-mermaid-plugin](https://github.com/chenshutian9610/deepseek-harness-mermaid-plugin) — deepseek-harness mermaid 支持
- [deepseek-harness-model-config](https://github.com/MarvekG/deepseek-harness-model-config) — MarvekG/deepseek-harness-model-config discovered from GitHub.
- [deepseek-harness-orchestrate](https://github.com/apheli0os/deepseek-harness-orchestrate) — Declarative task-DAG orchestration plugin for DeepSeek Harness
- [deepseek-harness-pets](https://github.com/orxz/deepseek-harness-pets) — 这是一个专为 DeepSeek-Harness 定制的桌宠皮肤包， DeepSeek 的标志性“大鲸鱼”等宠物养成。
- [Deepseek-Harness-plug](https://github.com/Bxfjjb/Deepseek-Harness-plug) — 我的dsh插件
- [deepseek-harness-plugin-from-scratch](https://github.com/Opr4Mp3r/deepseek-harness-plugin-from-scratch) — Code-audited, progressive guide to production-grade DeepSeek Harness plugins
- [deepseek-harness-plugin-manager](https://github.com/hrhgit/deepseek-harness-plugin-manager) — Web plugin manager for DeepSeek Harness (DSH): inspect, search, group, enable, and disable Cordis plugins.
- [deepseek-harness-plugin-mcp](https://github.com/bobleer/deepseek-harness-plugin-mcp) — MCP server that lets any agent discover, install, and run DeepSeek Harness plugins (topic: dsh-plugin).
- [deepseek-harness-plugins](https://github.com/Hanihahaha/deepseek-harness-plugins) — Hanihahaha/deepseek-harness-plugins discovered from GitHub.
- [deepseek-harness-plugins](https://github.com/jinbaozi/deepseek-harness-plugins) — Personal deepseek harness plugins
- [deepseek-harness-plugins](https://github.com/meliodascz89/deepseek-harness-plugins) — Community plugins for DeepSeek Harness: local-vision (Ollama image description) and claude-to-dsh (Claude Code migration). MIT and Repetition guard and content cleaner plug-in.
- [deepseek-harness-plugs-manage](https://github.com/Casually/deepseek-harness-plugs-manage) — Deepseek Harness 插件管理工具，方便搜索安装官方插件库
- [deepseek-harness-prompt-optimizer](https://github.com/lizhecome/deepseek-harness-prompt-optimizer) — LLM-backed prompt optimization bundle for DeepSeek Harness
- [DeepSeek-harness-qqbot](https://github.com/sliverp/DeepSeek-harness-qqbot) — QQ Bot text and image channel plugin for DeepSeek Harness
- [deepseek-harness-quota-monitor](https://github.com/marisa-4219/deepseek-harness-quota-monitor) — DeepSeek Harness 多供应商额度监控插件：余额型 API 查询 + 限额型本地用量计量，侧边栏实时卡片 + 可视化配置。
- [deepseek-harness-remote](https://github.com/liguobao/deepseek-harness-remote) — 基于 DeepSeek Harness 插件机制的多端远程访问方案，让桌面端与 Android 端安全连接并操作远程 Harness。（A multi-device remote access solution built on the DeepSeek Harness plugin system, enabling desktop and Android clients to securely connect to and operate a remote Harness.）
- [DeepSeek-Harness-Remote](https://github.com/zxmqq1234/DeepSeek-Harness-Remote) — （手机远程对话）DeepSeek Harness 的安全远程访问层与手机 Companion。支持局域网、公网、P2P模式。本项目不是"把 3080 端口开放到局域网"的小插件，而是在远程世界与 Harness localhost 信任域之间建立一个新的、明确的、可审计的 Remote Access Security Layer
- [deepseek-harness-skillx](https://github.com/drowned-fish1/deepseek-harness-skillx) — DeepSeek Harness plugin for safely discovering, auditing, and adopting external Agent Skills — prompt-injection and AgentBaiting defense.
- [deepseek-harness-terminal-plugin](https://github.com/chenshutian9610/deepseek-harness-terminal-plugin) — DeepSeek Harness 网页版终端插件
- [deepseek-harness-themes](https://github.com/orxz/deepseek-harness-themes) — A collection of UI themes for deepseek-harness.
- [DeepSeek-Harness-Token-Free](https://github.com/hyqibot/DeepSeek-Harness-Token-Free) — A token-free desktop client for the DeepSeek Harness，enjoy！为 DeepSeek Harness (DSH) 生态打造的全免Token费的桌面端 ，极简极易
- [deepseek-harness-tool-palette](https://github.com/lizhecome/deepseek-harness-tool-palette) — Progressive tool discovery and per-agent unlocking for DeepSeek Harness
- [deepseek-harness-toolkit](https://github.com/huangmouren2023/deepseek-harness-toolkit) — Windows emergency toolkit for DeepSeek Harness
- [deepseek-harness-tui](https://github.com/gxinxing/deepseek-harness-tui) — Terminal-native interactive TUI for DeepSeek Harness (dsh) — built with Ink, React for terminals
- [deepseek-harness-tui](https://github.com/rayafriandion/deepseek-harness-tui) — The plugin can use terminal UI like opencode/claude code and other CLI/TUI agents.
- [DeepSeek-harness-wecom](https://github.com/sliverp/DeepSeek-harness-wecom) — WeCom AI Bot text and image bridge for DeepSeek Harness
- [DeepSeek-harness-weixin](https://github.com/sliverp/DeepSeek-harness-weixin) — Weixin ClawBot channel plugin for DeepSeek Harness with QR login and text/image messaging
- [deepseek-harness-workbench-plugin](https://github.com/loadingvx/deepseek-harness-workbench-plugin) — Deepseek-harness-workbench-plugin
- [DeepSeek-Harness-yizi-themes](https://github.com/laoduu/DeepSeek-Harness-yizi-themes) — 为 DeepSeek Harness（dsh）Web UI 提供的 19 个精品风格主题，完整移植自 YiziMarkdown 的设计语言。
- [deepseek-harness-zh_pro](https://github.com/magian1127/deepseek-harness-zh_pro) — Chinese enhancement plugin for DeepSeek Harness (DSH) - DSH 中文增强插件
- [deepseek-heartflow](https://github.com/yun520-1/deepseek-heartflow) — HeartFlow (心虫) as a DSH plugin — AGI 第1层辨别门禁: heartflow_check tool + automatic output supervision
- [deepseek-herness-login](https://github.com/javaxiaov/deepseek-herness-login) — dsh-login-plugin
- [deepseek-pet](https://github.com/keleus/deepseek-pet) — 在你的deepseek-harness上养一只吃白饭的大蓝鲸
- [deepseek-plugin-store](https://github.com/Ericwong5021/deepseek-plugin-store) — DeepSeek Harness 独立社区插件商店：发现、安装并提交经过验证的插件、工具与扩展。 | Independent community plugin directory.
- [DeepSeek-PPT-skill](https://github.com/lecutu/DeepSeek-PPT-skill) — DeepSeek PPT — AI-native PowerPoint generation. Constraint solver closes the loop so LLMs don't need vision
- [deepseek-protocol-doctor](https://github.com/Whning0513/deepseek-protocol-doctor) — Checks DeepSeek tool loops, reasoning_content, strict schemas, and captured SSE. Also works as a DSH plugin.
- [DeepSeek-TUI](https://github.com/TheMcSwift/DeepSeek-TUI) — dsh --profile tui：DeepSeek Harness 的终端交互客户端（out-of-tree profile bundle）
- [deepseek-vision](https://github.com/GOU-GEE/deepseek-vision) — GOU-GEE/deepseek-vision discovered from GitHub.
- [deepseek-vision](https://github.com/ToryReina/deepseek-vision) — ToryReina/deepseek-vision discovered from GitHub.
- [deepseek-visionary](https://github.com/xlight/deepseek-visionary) — 使用 DeepSeek 官方多模态视觉模型让你的 Agent 不再眼瞎（支持 DSH、Zed、OpenCode、Codex、Claude Code、Cursor、Claude Desktop）
- [DeepSeek-VisionPlus](https://github.com/qq247505/DeepSeek-VisionPlus) — DeepSeek VisionPlus — official-grade vision extension for DeepSeek Harness. Routes image understanding to a free vision-model pool (Zhipu GLM, SiliconFlow Qwen) with automatic fallback, rate limiting, one-click platform tests and live status lines; text stays on DeepSeek. One-command install. MIT.
- [deepseekeyes](https://github.com/dttxorg/deepseekeyes) — Auditable vision and cross-platform Computer Use runtime for DeepSeek Harness — strict evidence, health-checked failover, original pixels, and Token accounting.
- [delivery-review-dsh-plugin](https://github.com/xiaoxiao-svg/delivery-review-dsh-plugin) — 双 Agent 交付协作工作流的 DeepSeek Harness 原生插件。基于 DSH 的 Cordis 插件系统，以 bundle 方式分发，不改动 DSH 源码。
- [design-playbook](https://github.com/Bandersnatch0x/design-playbook) — Design I/O plugin for Claude Code & coding agents — declarations + contracts that make UI generation constrained, reviewable, and recirculatable. Not a style pack; composes with ui-ux-pro-max + frontend-design.
- [desktop-gui-automation-cua](https://github.com/afa-cloud/desktop-gui-automation-cua) — Cross-platform macOS desktop GUI automation & computer-use skill built on cua-driver: AX→pixel→desktop graceful degradation, vision-based element locating, privacy(automation) handling, and ready-made recipes for WeChat / iPhone Mirroring / QQ.
- [DevTools-Custom-Beautification-Plugin-for-DeepseekHarness-Class](https://github.com/1739321142/DevTools-Custom-Beautification-Plugin-for-DeepseekHarness-Class) — DeepseekHarness类DevTools自定义美化
- [dhs-theme-plugin](https://github.com/kongxiangyiren/dhs-theme-plugin) — dsh 主题管理插件,可以自定义主题
- [Digital-Sweet-Heart](https://github.com/dalintian/Digital-Sweet-Heart) — DSH means Digital Sweet Heart — A DSH Plugin to turn your DeepSeek Harness to AI lovers. 一个DSH插件将你的DeepSeek Harness改造成AI恋人（们）。
- [DIzzy-DSH](https://github.com/Acidmoon/DIzzy-DSH) — My DSH plugins
- [dockyard-dsh](https://github.com/AITabby/dockyard-dsh) — A macOS-only native account-pool and provider plugin for DeepSeek Harness.
- [docs-retriever](https://github.com/JohnXu22786/docs-retriever) — doctrove：面向编码 agent 的版本化库文档检索 MCP server（零依赖，dsh 插件 bundle 接入）
- [douyin-plugin-dsh-plugin](https://github.com/chu557/douyin-plugin-dsh-plugin) — 在使用dsh等待的过程中刷抖音
- [dph-endfield-theme](https://github.com/thjyy/dph-endfield-theme) — Unofficial Endfield-inspired theme and animated mascot for DeepSeek Harness Web
- [drive9-dsh](https://github.com/drive9-ai/drive9-dsh) — drive9-ai/drive9-dsh discovered from GitHub.
- [ds-balance](https://github.com/Lateautumns/ds-balance) — Lateautumns/ds-balance discovered from GitHub.
- [ds-turn-notify](https://github.com/reimu-create/ds-turn-notify) — reimu-create/ds-turn-notify discovered from GitHub.
- [ds-vision-plugin](https://github.com/Sorwcyra/ds-vision-plugin) — Paste images into DeepSeek Harness with a four-model vision race, OCR, and an automatic text bridge.
- [ds-whale-send-button](https://github.com/AsILAnn/ds-whale-send-button) — jinyu
- [dsh](https://github.com/qomob/dsh) — Home of dsh-plugin-hub: discover, evaluate, and install DeepSeek Harness (dsh) community plugins from inside dsh — plugin_search / plugin_info / plugin_install / plugin_remove tools, supply-chain trust tiers, and a Web Plugins marketplace tab. Also powers dsh.qomob.ai: a Chinese 0-to-1 Wiki and a daily-updated dsh plugin directory
- [DSH](https://github.com/Sean-Gao/DSH) — DSH插件
- [dsh_plugin](https://github.com/Neplich/dsh_plugin) — Neplich/dsh_plugin discovered from GitHub.
- [dsh_plugin_swift_cycle](https://github.com/Solismuchengxue/dsh_plugin_swift_cycle) — Swift Cycle governance skill adapter for DeepSeek Harness; user-invoked, version-pinned, and offline-verifiable.
- [DSH_plugins_4U](https://github.com/honghudavy-star/DSH_plugins_4U) — DSH 自建插件集合：微信桥接器 + GUI 微信入口补丁，一键安装
- [dsh_PromptRecall](https://github.com/liguanyu/dsh_PromptRecall) — 仿 Codex 的 DSH Web GUI 输入历史插件：会话输入框按 ↑/↓ 浏览历史 prompt，Esc清除当前对话框并进入历史，跨会话、跨重启持久保留，仅存纯文本，安全接管不误伤草稿。 A Codex-style input-history plugin for the DSH Web GUI: recall previous prompts with ↑/↓ in the composer, persisted across conversations and restarts, text-only storage with safe key routing.
- [dsh_Rhine_Lab_themo](https://github.com/ReLuckyLucy/dsh_Rhine_Lab_themo) — Arknights Rhine Lab (莱茵生命) skin for the DeepSeek Harness Web GUI
- [DSH_WebNotification](https://github.com/Zouu-X/DSH_WebNotification) — It is a plug-in that helps sending notifications when agent finishes in DSH. 这是一个DSH的网页提示插件，让Agent跑完任务时会有明确提示
- [dsh-1bot](https://github.com/yuyi2439/dsh-1bot) — yuyi2439/dsh-1bot discovered from GitHub.
- [dsh-2origin](https://github.com/dongsheng123132/dsh-2origin) — Evidence-first 2Origin state projection, diff and immutable freeze for DeepSeek Harness
- [dsh-815-skin](https://github.com/lengduan/dsh-815-skin) — 1945-08-15 世界名画 dsh皮肤
- [dsh-a-stock-select](https://github.com/ct188579/dsh-a-stock-select) — 基于 a-stock-data（A股数据源） 开发的 DSH 技能插件：将 a-stock-data V3.6.1 的全部 47 个数据端点内嵌合并，叠加四大策略筛选逻辑、持仓诊断流程与强制风控纪律，做成自包含的 SKILL.md——零外部依赖、开箱即用。同时打包为 npm 插件，支持 dsh 命令一键安装。
- [dsh-a2a](https://github.com/dpskh/dsh-a2a) — Agent2Agent mesh for the Harness
- [dsh-about-updater](https://github.com/archyciao/dsh-about-updater) — DeepSeek Harness (dsh) 插件：设置页「关于」- 版本显示/检查更新/一键重启
- [dsh-abyss](https://github.com/Zongwei9888/dsh-abyss) — 🌊 深海事务所 · Abyss — 把 DeepSeek Harness 的多 agent 运行画成一间看得见的事务所：委派谱系、每个 agent 的成本与失败归因、上下文水位、考勤时间线，历史案子可回放并一键导出 Markdown 复盘。A DeepSeek Harness plugin that turns an agent fleet into an office you can watch.
- [dsh-academic-research](https://github.com/userInner/dsh-academic-research) — Evidence-grounded bilingual academic research plugin for DeepSeek Harness and OnPeople
- [dsh-access-gate](https://github.com/bamboostrip/dsh-access-gate) — bamboostrip/dsh-access-gate discovered from GitHub.
- [dsh-access-mode](https://github.com/ddll8023/dsh-access-mode) — Session access-mode plugin (Default / No Edit / Auto) for DeepSeek Harness (DSH). dsh-plugin
- [dsh-account-usage](https://github.com/Ycet/dsh-account-usage) — 为dsh增加「设置：账户」页面，可快捷查看deepseek余额、用量信息，以及opencode go额度信息，同时可快速跳转至对应官网。Add a "Settings: Account" page for dsh, allowing quick viewing of DeepSeek balance, usage information, and OpenCode Go quota details, while also providing quick links to the respective official websites.
- [dsh-accounts](https://github.com/kangshifu1/dsh-accounts) — DSH multi-tenant auth plugin: PostgreSQL-backed accounts, admin management, per-user workspace isolation. #dsh-plugin
- [dsh-achievements](https://github.com/Blaczz/dsh-achievements) — DeepSeek Harness achievement & gamification plugin: cross-session badges for turns, tool calls, sessions and daily streaks, with a badge panel, unlock toasts and a ctx.achievements service. Zero core changes.
- [dsh-achievements](https://github.com/WJNCT55555/dsh-achievements) — WJNCT55555/dsh-achievements discovered from GitHub.
- [dsh-acp](https://github.com/cnctem/dsh-acp) — ACP server for DeepSeek Harness — bridges Zed and other IDEs to dsh agents
- [dsh-acp-enhanced](https://github.com/grunmin/dsh-acp-enhanced) — Enhanced ACP (Agent Client Protocol) server for DeepSeek Harness (dsh) — drop-in bridge for the Zed editor: block-level streaming, usage/stat telemetry, model & reasoning-effort switching, permission presets, session resume & archive. Install: dsh plugin add
- [dsh-acp-paseo](https://github.com/Pheobe-Southwood/dsh-acp-paseo) — dsh (DeepSeek Harness) ⇄ Paseo ACP integration bundle: auto-discovered model catalog, plan/execute modes, thinking levels, and native dsh slash commands in Paseo.
- [dsh-acp-plugin](https://github.com/agentic-control-plane/dsh-acp-plugin) — Agentic Control Plane for DeepSeek Harness — policy-check every tool call before it runs
- [dsh-action-ledger](https://github.com/MkaliezZ/dsh-action-ledger) — Bounded action-lifecycle projection for DeepSeek Harness: /action-ledger reconstructs a human-readable action ledger from the durable session log.
- [dsh-action-parity](https://github.com/dongsheng123132/dsh-action-parity) — Cross-surface action binding and replay parity evidence for DeepSeek Harness
- [dsh-active-context-pruning](https://github.com/aerince/dsh-active-context-pruning) — Model-authored context pruning for DeepSeek Harness through the official compaction API.
- [dsh-add-headers-to-completions](https://github.com/mc-lhz/dsh-add-headers-to-completions) — 添加headers到dsh的ChatCompletions请求中，可用于接入OpenCode的免费v4-flash、hy3等模型
- [dsh-admin](https://github.com/xiaokang6/dsh-admin) — DeepSeek Harness Web GUI admin plugin: manual restart + auto version check (header button + settings page)
- [dsh-admin-gateway](https://github.com/myfire2014/dsh-admin-gateway) — dsh-admin-gateway DeepSeek Harness (dsh) 管理员验证网关插件。 只需一个绑定在 Cloudflare 的域名
- [dsh-advanced-model-editor](https://github.com/u9521/dsh-advanced-model-editor) — DSH WebUI plugin for managing custom LLM providers, model parameters, thinking budgets, and request settings.
- [dsh-advisor](https://github.com/glangzh/dsh-advisor) — 给 DeepSeek Harness 的 Agent 增加一位"顾问"：日常任务使用较弱模型（默认模型），遇到真正困难的决策时，Agent 会自动向一个更强的模型咨询。
- [dsh-advisor](https://github.com/omdsh-dev/dsh-advisor) — Advisor - Pair a second model that passively reviews each turn and injects notes. 搭配一个会在每轮对话被动注入见解和审查的副模型。
- [dsh-advisor](https://github.com/slhssb/dsh-advisor) — Independent-model advisory review for DeepSeek Harness: after each tool step, a reviewer model audits the agent's operations and injects concerns/guidance into the next step.
- [dsh-aemeath-pet](https://github.com/culture-flask/dsh-aemeath-pet) — 爱弥斯 · DeepSeek Harness 桌宠 — DeepSeek Harness Web GUI 的像素风宠物插件。
- [dsh-agency-agents](https://github.com/MichengAI/dsh-agency-agents) — DSH agency agents 基于 DeepSeek Harness 的全行业智能体
- [dsh-agency-agents-zh](https://github.com/GongYuanCaiJi/dsh-agency-agents-zh) — 267 个即插即用的 AI 专家角色定义——从前端开发到区块链安全，从小红书运营到抖音策略（移植自 agency-agents-zh）
- [dsh-agent-arena](https://github.com/LeemanCheung/dsh-agent-arena) — Isolated multi-model coding matches with deterministic verification, scoring, and reports
- [dsh-agent-arena](https://github.com/Tikzen/dsh-agent-arena) — Interactive multi-agent collaboration, meetings, group chats, and task execution for DeepSeek Harness.
- [dsh-agent-compact](https://github.com/MimicHunterZ/dsh-agent-compact) — DSH plugin for agent-driven span compaction: compress chosen conversation spans into self-written checkpoints instead of the official head-anchored full-context sweep.
- [dsh-agent-conductor](https://github.com/akqwpeter-prog/dsh-agent-conductor) — ⚡ DSH 指挥家（动态插件/热更新版）：在会话里派活给 11 种外部 agent CLI（Codex/Claude Code/TraeCode…），cordis_define 秒级安装，不碰 profile。
- [dsh-agent-context](https://github.com/jonah791/dsh-agent-context) — DSH plugin: dsh-agent-context
- [dsh-agent-doctor](https://github.com/MkaliezZ/dsh-agent-doctor) — DeepSeek Harness health and safety diagnostics: /doctor inspects the effective model-visible tool surface.
- [dsh-agent-evaluator](https://github.com/yan77-h/dsh-agent-evaluator) — agent evaluation
- [dsh-agent-life](https://github.com/jonah791/dsh-agent-life) — DSH plugin: dsh-agent-life
- [dsh-agent-md](https://github.com/mrwoov/dsh-agent-md) — dsh agents.md manager
- [dsh-agent-memory](https://github.com/findshan/dsh-agent-memory) — Self-evolving memory for DeepSeek Harness: capture → dream consolidation → retrieval injection → evolve. User profile, project memory, correction learning, resume narrative — with provenance back to the replayable session log. 自进化记忆插件。
- [dsh-agent-memory](https://github.com/jonah791/dsh-agent-memory) — Agent-driven long-term memory for DeepSeek Harness (DSH)
- [dsh-agent-message](https://github.com/GengDaPeng/dsh-agent-message) — DeepSeek Harness 跨会话 Agent 通信插件｜Cross-session agent-to-agent messaging with offline delivery, receipts and session navigation for DeepSeek Harness.
- [dsh-agent-messaging](https://github.com/happyren/dsh-agent-messaging) — Cross-session verification, claims and a decision ledger for DeepSeek Harness — so two agent sessions don't repeat, contradict or deadlock each other.
- [dsh-agent-preset-recommender](https://github.com/LeemanCheung/dsh-agent-preset-recommender) — Privacy-safe local Codex, Claude Code, WorkBuddy and CodeBuddy activity scanner that recommends DSH agent presets.
- [dsh-agent-pricing](https://github.com/Way2LOose4/dsh-agent-pricing) — Real-time session cost preview for DeepSeek Harness: live cost readout, today usage chart, price_estimate/session_cost tools, prices kept in sync with the DeepSeek official site (peak/off-peak aware)
- [dsh-agent-relay](https://github.com/Noelune/dsh-agent-relay) — Local multi-agent collaboration relay for DeepSeek Harness — HMAC-authenticated loopback message broker for dsh, Codex, Claude Code & Hermes.
- [dsh-agent-replay](https://github.com/forrestsweet/dsh-agent-replay) — DeepSeek Harness 会话回放与脱敏分享插件：将真实 Agent 轨迹导出为独立交互 HTML，用于文档、演示和问题反馈。
- [dsh-agent-run-logger](https://github.com/bluefateludi/dsh-agent-run-logger) — Local JSONL run tracing plugin for DeepSeek Harness — records agent runs, model steps, tool calls, timings, outcomes, and token usage.
- [dsh-agent-team-gui](https://github.com/toolclub/dsh-agent-team-gui) — Persistent multi-model agent squads for DeepSeek Harness — reusable teams, per-agent model/tool policies, and ordinary-chat collaboration.
- [dsh-agent-team-room](https://github.com/ishuowang/dsh-agent-team-room) — Native DSH rooms for connecting independent Sessions and provider-backed AI members—without bundled roles or scenarios.
- [dsh-agentfuse-plugin](https://github.com/MkaliezZ/dsh-agentfuse-plugin) — Deterministic fail-closed tool-call authorization for DSH with evidence: allow/block/ask policy gate plus approval-chain deferral.
- [dsh-agentmemory](https://github.com/elementor-i/dsh-agentmemory) — agentmemory for DeepSeek Harness (dsh): full memory_* tools, capture hooks, and context injection over the local REST server
- [dsh-agentmemory](https://github.com/Yiipu/dsh-agentmemory) — a DSH (DeepSeek Harness) Cordis plugin that bridges a session's activity into agentmemory, a local, self-hosted memory daemon.
- [dsh-agentsoul](https://github.com/yuhui-sama/dsh-agentsoul) — Local personality, memory and distillation layer for DeepSeek Harness — SOUL/IDENTITY/USER/STATE persona files, cross-session memory and LLM distillation, auto-loaded on startup.
- [dsh-AgentTask](https://github.com/knGear/dsh-AgentTask) — knGear/dsh-AgentTask discovered from GitHub.
- [dsh-agfs](https://github.com/openAGFS/dsh-agfs) — Agent FileBrowser for DeepSeek Harness
- [dsh-agnes-omni](https://github.com/wumu1111111/dsh-agnes-omni) — Agnes omni-modal plugin for DeepSeek Harness: agnes_vision (image understanding) + agnes_image (text-to-image / image-to-image) + a vision bridge that lets you send images in chat. API key via DSH credentials, never in code.
- [dsh-agnes-paseo](https://github.com/vvlife/dsh-agnes-paseo) — vvlife/dsh-agnes-paseo discovered from GitHub.
- [dsh-agy](https://github.com/chaos-03x/dsh-agy) — Google Antigravity (agy) OAuth auth + model access plugin for DeepSeek Harness: multi-account pool, 429 rotation, device fingerprinting, CLI and web login.
- [dsh-ai-prompt-optimizer](https://github.com/wuchubuzai2018/dsh-ai-prompt-optimizer) — DeepSeek Harness（DSH）Web 聊天页面的提示词优化插件,帮助你把粗略想法整理成更清晰、完整、可直接发送给 AI 的提示词
- [dsh-aicc-zhunao](https://github.com/Cola1018/dsh-aicc-zhunao) — Public DeepSeek Harness preset for AICC main-brain orchestration and execution gating.
- [dsh-airbag](https://github.com/uwu9039/dsh-airbag) — 呱来点人口牙...再也不会误把api key粘贴喂给ai了!!!可自定义的安全等级与安全措施，解决容易泄漏api key的底层问题。同时有报告记录可查!!!
- [dsh-aitoearn](https://github.com/lussey820/dsh-aitoearn) — AiToEarn content-creation suite as a DeepSeek Harness plugin: creative director, script writer, image-text/video generation, Douyin publishing.
- [dsh-all-search](https://github.com/RealAlexandreAI/dsh-all-search) — dsh search: AnySearch web search provider for DeepSeek Harness (ctx.web)
- [dsh-all-warmup](https://github.com/brunhildzhou/dsh-all-warmup) — Global frictionless warm-up layer plugin for DeepSeek Harness | DeepSeek Harness 全局无感热身层插件：任何会话首轮自动热身，第二轮起恢复完整模式
- [dsh-ambience](https://github.com/Hyna-hla/dsh-ambience) — Hyna-hla/dsh-ambience discovered from GitHub.
- [dsh-analytics](https://github.com/hccccc01333/dsh-analytics) — hccccc01333/dsh-analytics discovered from GitHub.
- [dsh-analyze-image-tool](https://github.com/CaseyTso/dsh-analyze-image-tool) — 给纯文本 DeepSeek Harness 模型加上识图能力：analyze_image 把图片转发到任意 OpenAI 兼容视觉端点 | Vision bridge for text-only DSH models
- [dsh-anchored-preset-installer](https://github.com/kirkchinese/dsh-anchored-preset-installer) — kirkchinese/dsh-anchored-preset-installer discovered from GitHub.
- [dsh-anchored-standard](https://github.com/Jungod1121/dsh-anchored-standard) — Two-phase DeepSeek Harness preset: Minimal-aligned bootstrap (bash+read), then full Standard tools after the first tool call or reply
- [dsh-anchored-subagent](https://github.com/GY-Bai/dsh-anchored-subagent) — DS的伟哥补丁，subagent都能满血！
- [dsh-anchored-wsl](https://github.com/dHR-P/dsh-anchored-wsl) — Two-phase DeepSeek Harness preset: first turn = official Minimal mode (We-chain anchor), then full Standard tools on Windows (Git Bash / WSL). 首轮极简锚定 + 第二轮标准工具
- [dsh-ankh-guard](https://github.com/Khorsheed/dsh-ankh-guard) — 防止 Agent 自我修改把服务改崩的守护插件（dsh 插件）：绿色构建凭证绑定 git HEAD，改坏不许重启；watchdog 无感重启 + canary 自动回滚
- [dsh-annotation-plugin](https://github.com/boboozeng/dsh-annotation-plugin) — boboozeng/dsh-annotation-plugin discovered from GitHub.
- [dsh-answer-sound](https://github.com/zl99103/dsh-answer-sound) — Agent answer sound effects for the DeepSeek Harness web GUI: start/done/error tones following the answering lifecycle, per-kind volume, custom audio files, master switch.
- [dsh-anthropic-fonts](https://github.com/Isilsolme/dsh-anthropic-fonts) — Isilsolme/dsh-anthropic-fonts discovered from GitHub.
- [dsh-antigravity-auth](https://github.com/UE-DND/dsh-antigravity-auth) — DeepSeek Hardness 插件，用于在 DSH 中使用 Antigravity 提供的模型
- [dsh-any-attachment](https://github.com/Zenjibad/dsh-any-attachment) — dsh bundle: attach any file type in the DeepSeek Harness Web UI — text-likes inline, binaries as workspace path references, rasters via the built-in pipeline
- [dsh-any-background](https://github.com/Tkingxiao/dsh-any-background) — 一个自定义主题插件，包括背景图（大小和位置），主界面和设置界面（透明度，色轮全色主题色）插件
- [dsh-anywhere-web](https://github.com/CsBpRd/dsh-anywhere-web) — CsBpRd/dsh-anywhere-web discovered from GitHub.
- [dsh-APEX_Plugin](https://github.com/GTC2080/dsh-APEX_Plugin) — Experimental APEX plugin for DeepSeek Harness: Minimal-anchored bootstrap with on-demand Standard tools. Current baseline: Minimal Max v0.2.
- [dsh-apex-standard](https://github.com/rinDBeans/dsh-apex-standard) — DeepSeek V4 Pro/Flash unified anchored agent preset for DeepSeek Harness (official API & opencode-go): two-stage RL-aligned bootstrap, model-aware path routing, epoch-aware long-session stability
- [dsh-api-balance](https://github.com/02Muller25/dsh-api-balance) — 安装在deepseek的插件，能够实时显示当前api的余额，30秒自动刷新一次
- [dsh-api-balance](https://github.com/9Epuuuu/dsh-api-balance) — DeepSeek account balance readout for DSH Web (dsh-plugin)
- [dsh-api-balance](https://github.com/GPIOX/dsh-api-balance) — DeepSeek Harness 动态 Cordis 插件：可拖动、可缩放、亚克力质感的 API 余额悬浮徽章
- [dsh-api-contract](https://github.com/uckkk/dsh-api-contract) — 接口契约助手：解析 OpenAPI 3.x，生成 TypeScript/Python 类型化客户端并检测破坏性变更
- [dsh-api-cost](https://github.com/CCCq-C/dsh-api-cost) — DeepSeek Harness 插件：实时显示本会话 API 用量开销 / Real-time per-session API cost meter for DeepSeek Harness
- [dsh-api-gateway](https://github.com/litestartup-com/dsh-api-gateway) — DeepSeek Harness的开源 API Gateway 插件：任何第三方客户端（包括飞书/钉钉等即时通讯）都能通过REST + SSE接口与你的 Agent 会话交互。
- [dsh-api-key-pool](https://github.com/xiaozhe7772222/dsh-api-key-pool) — API Key rotation pool for DeepSeek Harness: multi-key round-robin, failover on 401/403/429, cooldown & recovery, Web UI management panel
- [dsh-api-mock](https://github.com/uckkk/dsh-api-mock) — 接口模拟服务器：解析 OpenAPI 3.x，生成零依赖 Node Mock 服务器并按 schema 生成示例数据
- [dsh-api-testgen](https://github.com/uckkk/dsh-api-testgen) — 接口测试生成：解析 OpenAPI 3.x，生成覆盖成功/缺参/非法枚举的 pytest/vitest 接口测试骨架
- [dsh-api-tools](https://github.com/Adachi-Hougetsu/dsh-api-tools) — dsh API usage metering and one-click refresh plugins for DeepSeek Harness
- [dsh-api-usage](https://github.com/chenzhexii/dsh-api-usage) — 在 DSH Web 界面侧边栏底部提供常驻小部件，实时展示 DeepSeek API 的当前余额、今日消费、Token 用量与请求次数，并附 24 小时消费柱状图，点击即可直达 DeepSeek 充值页。
- [dsh-api-usage-bar](https://github.com/hurry060215-tech/dsh-api-usage-bar) — Cache-aware API token usage bar for the DeepSeek Harness Web UI
- [dsh-api-usage-monitor](https://github.com/DrFaithinT/dsh-api-usage-monitor) — DeepSeek Harness 动态 Cordis 插件：实时读取当前使用的 LLM API，在设置页呈现当前用量、分对话用量，并可扫描会话日志读取历史用量。
- [dsh-app-launcher](https://github.com/Alvin-Somedo/dsh-app-launcher) — 把 DSH Web GUI 变成"桌面应用":以独立应用窗口打开,关闭窗口即优雅退出整个 DSH 进程
- [dsh-appearance](https://github.com/levi52/dsh-appearance) — DeepSeek Harness Web UI 的外观设置插件，一键个性化你的 Web UI
- [dsh-approval-ai](https://github.com/ang-XWBWZ/dsh-approval-ai) — AI approval answerer for DeepSeek Harness (DSH) using the unified LLM route with fail-closed policy checks.
- [dsh-approval-comment](https://github.com/MaYiFei1995/dsh-approval-comment) — DSHWeb 审批增强插件：无感替代内置审批窗口，支持「拒绝并附言」，并在拒绝后终止当前回合、让模型重新结合附言思考
- [dsh-approval-flow-poc](https://github.com/lasoloryan/dsh-approval-flow-poc) — Non-official fail-closed approval policy PoC for DeepSeek Harness
- [dsh-approval-gate](https://github.com/moon09300731/dsh-approval-gate) — DeepSeek Harness 自动审批门控：Flash 预判不可回补操作，安全自动批准、危险转人工（fail-safe）
- [dsh-approval-guardian](https://github.com/karuboniru/dsh-approval-guardian) — 模仿codex auto-review 的自动审批机制
- [dsh-approval-mode](https://github.com/NEVSTOP-LAB/dsh-approval-mode) — DSH 审批模式插件，在 DSH 窗口的权限下拉框（Read Only / Workspace Write / Full Access）旁边加一个「审批模式」按钮，在 Workspace Write 模式下工具调用自动放行
- [dsh-approval-voice](https://github.com/ZIye1208/dsh-approval-voice) — DSH Web GUI 审批语音提示插件：需要审批/回答的弹窗出现时播放提示音并语音播报
- [dsh-approve-for-me](https://github.com/Hakunm/dsh-approve-for-me) — 为DeepSeek Harness添加“代我审核”功能，让 AI 替你审查 DSH 的敏感操作，而不是直接交出全部权限。Fail-closed automatic approval for DeepSeek Harness with selectable reviewer models and visible WebUI decisions.
- [dsh-approve-for-me](https://github.com/timeance/dsh-approve-for-me) — DeepSeek Harness plugin for rule-gated automatic sandbox approval with optional LLM review, one-time grants, fixed high-risk checks, and native human fallback.
- [dsh-arbitrary-host](https://github.com/FairyScript/dsh-arbitrary-host) — FairyScript/dsh-arbitrary-host discovered from GitHub.
- [dsh-arcaea-theme](https://github.com/a1swg1159-pixel/dsh-arcaea-theme) — An original Arcaea-inspired high-key prismatic UI theme plugin for DeepSeek Harness.
- [dsh-archify](https://github.com/GongYuanCaiJi/dsh-archify) — DeepSeek Harness 插件：用 JSON 规格生成可验证的架构图、流程图、时序图、数据流图与生命周期图（移植自 tt-a1i/archify）
- [dsh-archive-manager](https://github.com/jasonrale/dsh-archive-manager) — Archive panel for DSH WebUI: reopen, unarchive, or permanently delete sessions — with search and native-feel UI
- [dsh-archive-manager](https://github.com/MichengAI/dsh-archive-manager) — DSH Archive Manager 基于 DeepSeek Harness 的归档会话管理插件
- [dsh-archive-manager](https://github.com/Saikel-Orado-Liu/dsh-archive-manager) — Archived-session management (show/unarchive/permanently delete) for the DSH Web GUI, with zero changes to official packages.
- [dsh-archive-manager](https://github.com/z953218350/dsh-archive-manager) — Codex-style archived session manager for DSH Web UI — view, search, restore, and delete archived sessions from the settings page
- [dsh-archive-manager](https://github.com/zimixvx/dsh-archive-manager) — zimixvx/dsh-archive-manager discovered from GitHub.
- [dsh-archive-vault](https://github.com/Britneycode/dsh-archive-vault) — dsh 插件：在设置面板中查看、恢复与永久删除归档会话
- [dsh-archive-viewer](https://github.com/csiroqa/dsh-archive-viewer) — DeepSeek Harness（DSH）归档增强插件：自动定期归档、文件夹归档整理、LLM 摘要沉淀经验库、会话收藏与便签、会话删除与优雅关机。Archive enhancement plugin for DeepSeek Harness: auto-archive, folder organization, LLM knowledge library, bookmarks & notes, session delete.
- [dsh-archive-viewer](https://github.com/DimitriLIAN/dsh-archive-viewer) — List and restore archived sessions from the DeepSeek Harness Web settings
- [dsh-archive-viewer](https://github.com/keepermttl/dsh-archive-viewer) — DeepSeek Harness 归档会话管理插件：查看/恢复已归档会话（回到原工作区分组）+ 右上角一键关闭 dsh。MIT 许可，欢迎收录到任何插件合集，注明出处即可。
- [dsh-archived-chats](https://github.com/Ultronen/dsh-archived-chats) — DeepSeek Harness 已归档会话管理页：在设置里查看、搜索、取消归档、删除已归档的聊天，按项目分组。An Archived Chats settings page for DeepSeek Harness: browse, search, unarchive, and delete archived sessions, grouped by workspace.
- [dsh-archived-conversations](https://github.com/AKS1st/dsh-archived-conversations) — Show archived conversations in the DSH Web sidebar footer with read-only message previews.
- [dsh-archived-sessions](https://github.com/hashdiana/dsh-archived-sessions) — hashdiana/dsh-archived-sessions discovered from GitHub.
- [dsh-archived-sessions](https://github.com/kinomoto-hakage/dsh-archived-sessions) — dsh 已归档会话
- [dsh-archived-sessions](https://github.com/MuWinds/dsh-archived-sessions) — DeepSeek Harness 插件-归档会话管理，支持释放、清除归档会话
- [dsh-archived-sessions](https://github.com/Zephyr-vibe/dsh-archived-sessions) — DSH Session Manager: manage conversations, archive/restore, delete safely, open record folders.
- [DSH-arena](https://github.com/Apageoflove/DSH-arena) — Local-first experiment and evaluation workbench plugin for DeepSeek Harness (DSH).
- [dsh-arknights](https://github.com/DocJlm/dsh-arknights) — DSH Web 明日方舟主题皮肤合集，支持社区创作者提交 PR
- [dsh-article-publish](https://github.com/yangyongzhen/dsh-article-publish) — Publish articles from DeepSeek Harness to CSDN / Juejin / CNBlog. dsh plugin.
- [dsh-artifact](https://github.com/Jannchie/dsh-artifact) — Claude-Code-style artifacts for DeepSeek Harness: an artifact tool, an authoring skill, and an in-app sandboxed HTML browser
- [dsh-artifact](https://github.com/sumarilkkxx/dsh-artifact) — Inline ECharts rendering plugin for DeepSeek Harness
- [dsh-artifacts](https://github.com/zoahdev/dsh-artifacts) — Claude-Artifacts-style rendering for DeepSeek Harness: Markdown + JSON -> beautiful self-contained HTML documents, cards, dashboards, and galleries. Zero runtime dependencies.
- [dsh-arxiv-search](https://github.com/lixvn888/dsh-arxiv-search) — dsh-arxiv-search skill
- [dsh-asc](https://github.com/lmst2/dsh-asc) — lmst2/dsh-asc discovered from GitHub.
- [dsh-asimovbox](https://github.com/cerebrixos-org/dsh-asimovbox) — AsimovBox video tools for DeepSeek Harness
- [dsh-ask-guard](https://github.com/Q1hangL/dsh-ask-guard) — Timeout guard for ask_user_question in DeepSeek Harness: a lost or unanswered question resolves as ASK_TIMEOUT instead of hanging the turn forever
- [dsh-assistant-message-forge](https://github.com/anweat/dsh-assistant-message-forge) — DSH assistant message forge: create/modify/inject test assistant messages, import session.jsonl(.zstd) session logs (client plugin)
- [dsh-at](https://github.com/KureKaruna/dsh-at) — KureKaruna/dsh-at discovered from GitHub.
- [dsh-at-mention](https://github.com/ShiraGawaAnri/dsh-at-mention) — DSH 配置档插件(profile bundle):像 Claude Code / Codex Desktop 一样,在输入框输入 `@` 提及**当前会话所在工作区**的文件/目录,支持带优先级的模糊搜索与键盘补全。
- [dsh-atlascloud](https://github.com/AtlasCloudAI/dsh-atlascloud) — Atlas Cloud skills and opt-in MCP tools for DeepSeek Harness
- [dsh-atomgit](https://github.com/xiongjiamu/dsh-atomgit) — AtomGit plugin bundle for DeepSeek Harness (dsh): atomgit-skills workflows + ag CLI + platform-hosted AtomGit/GitCode MCP tools
- [dsh-attachment-formats](https://github.com/genusamblyrhynchusbrunooftoul602/dsh-attachment-formats) — Extend DeepSeek Harness composer to accept PDFs and more attachment formats Codex-style, with zero core changes and native pipeline reuse.
- [dsh-attachment-formats](https://github.com/linkingoscar/dsh-attachment-formats) — Codex-style attachment formats for the DeepSeek Harness Web GUI: PDF text-layer extraction, Office text extraction, scanned-PDF OCR, long-document spill + index cards, image-to-PNG.
- [dsh-attachments](https://github.com/CocoSgt/dsh-attachments) — CocoSgt/dsh-attachments discovered from GitHub.
- [dsh-attachments](https://github.com/LCYLYM/dsh-attachments) — Cross-platform DSH WebUI multimedia input and workspace attachments
- [dsh-atuin](https://github.com/RealAlexandreAI/dsh-atuin) — dsh atuin-history: record dsh user prompts into atuin shell history
- [dsh-audio-alert](https://github.com/ellelkktrraaa/dsh-audio-alert) — dsh中断声音提示喵（可配置音频喵）Browser audio alerts for dsh attention edges: approval requests, ask-user questions, and finished turns.
- [dsh-audio-dub](https://github.com/pinch-eng/dsh-audio-dub) — Dub video and audio into 10 languages with voice cloning, from a DeepSeek Harness agent | DSH 视频/音频配音插件
- [dsh-audit-bundle](https://github.com/dongsheng123132/dsh-audit-bundle) — Content-addressed audit indexes across independent DeepSeek Harness evidence producers
- [dsh-aura-scheduler](https://github.com/ljsysfurryACE/dsh-aura-scheduler) — Proactive scheduling for DeepSeek Harness: Aura heartbeat + value network (official is model-driven only)
- [dsh-auth](https://github.com/radaren/dsh-auth) — radaren/dsh-auth discovered from GitHub.
- [dsh-auth-everying](https://github.com/chenbin-dev/dsh-auth-everying) — 导入本地 Claude、Codex、Grok、Gemini、Copilot、OpenCode 与 CC Switch 配置。 为支持的官方供应商提供 OAuth 登录。 从 OpenAI 兼容网关的 /v1/models 与 /models 发现 CC Switch 模型。
- [dsh-auth-gate](https://github.com/jiang539/dsh-auth-gate) — DSH Web UI 的认证门禁插件，提供 SVG 图形验证码与防暴力破解保护
- [dsh-auth-gate](https://github.com/TecFancy/dsh-auth-gate) — Login gate for the DeepSeek Harness (dsh) web surface: password or shared-token authentication, session cookies, rate limiting, and a user-management CLI. | DeepSeek Harness (dsh) 网页版登录门插件:账号口令或共享令牌认证、会话 cookie、登录限速,附用户管理 CLI。
- [dsh-auth-proxy](https://github.com/wxyzh/dsh-auth-proxy) — wxyzh/dsh-auth-proxy discovered from GitHub.
- [dsh-auth-tunnel](https://github.com/ai-eks/dsh-auth-tunnel) — Password-gated Cloudflare Tunnel access for the DeepSeek Harness Web GUI, with quick and named tunnel modes.
- [dsh-AuthInOne](https://github.com/Stormycry-cryp/dsh-AuthInOne) — Self-contained DeepSeek Harness (DSH) plugin for Provider/Auth login, model switching, image fallback, token/cost analytics, and same-port Web restart. Useful? A star helps.
- [dsh-authorize-app](https://github.com/extension-hunter/dsh-authorize-app) — DeepSeek Harness plugin: a 'Connected Apps' settings section — a central platform where other DSH plugins surface themselves.
- [dsh-auto](https://github.com/simon300000/dsh-auto) — dsh Auto Approve
- [dsh-auto-approval](https://github.com/Andy8647/dsh-auto-approval) — Andy8647/dsh-auto-approval discovered from GitHub.
- [dsh-auto-approval](https://github.com/SipengXie2024/dsh-auto-approval) — LLM-gated auto approval for DeepSeek Harness: a model judges every approval ask first, low-risk operations pass without prompting (fail-closed)
- [dsh-auto-approval-plugin](https://github.com/StyxNether/dsh-auto-approval-plugin) — Trusted Auto: a middle permission tier for DeepSeek Harness between workspace-write and danger-full-access, auto-approving harmless commands and trusted-area targets
- [dsh-auto-approve](https://github.com/Jiao-XXX/dsh-auto-approve) — 为 DeepSeek Harness 增加介于 Workspace Write 与 Full access 之间的自动批准权限档，危险或不确定操作仍转人工审批。An auto-approval permission preset between workspace-write and full access for DeepSeek Harness.
- [dsh-auto-classifier](https://github.com/PAKIKNOWLEDGE/dsh-auto-classifier) — PAKIKNOWLEDGE/dsh-auto-classifier discovered from GitHub.
- [dsh-auto-coding](https://github.com/facai0316/dsh-auto-coding) — 一个代码流水线，前期磨合好了以后，会有个很舒服的 vibe coding 体验，也可以更好的把闲时 token 利用起来（白天人肉测试+写需求+审核前一天的计划和决策，晚上让流水线自己挂着跑）
- [dsh-auto-collapse](https://github.com/a179-sanae/dsh-auto-collapse) — a179-sanae/dsh-auto-collapse discovered from GitHub.
- [dsh-auto-continue](https://github.com/Aki2519/dsh-auto-continue) — Aki2519/dsh-auto-continue discovered from GitHub.
- [dsh-auto-fold-turn](https://github.com/ycp424c/dsh-auto-fold-turn) — ycp424c/dsh-auto-fold-turn discovered from GitHub.
- [dsh-auto-goal-resume](https://github.com/tmeeli/dsh-auto-goal-resume) — DeepSeek Harness 插件:重启后自动续跑有活跃目标(goal)的会话,无需人工说继续。
- [dsh-auto-memory](https://github.com/1304836815/dsh-auto-memory) — DSH 会话级记忆插件：收尾提醒 + MEMORY.md 记忆索引维护 + 实时对话日志 + LLM 摘要压缩，配置面板在 设置→插件。Session memory for DeepSeek Harness.
- [dsh-auto-memory](https://github.com/Aik358/dsh-auto-memory) — DSH 自动记忆插件:三层记忆(用户级/项目笔记/每日日志)自动注入与检索、每日反思、可视化面板与设置页,支持继承其他 AI 工具的历史记忆。An auto-memory plugin for the DeepSeek Harness Web GUI: three-layer memory (user-level / project notes / daily logs) with automatic injection and retrieval, daily reflections, a visual panel and settings page, and inheritance of memories from other AI tools.
- [dsh-auto-mode](https://github.com/NanmiCoder/dsh-auto-mode) — Safe automatic permissions for DeepSeek Harness.
- [dsh-auto-model](https://github.com/AL-spiritphoenix/dsh-auto-model) — AL-spiritphoenix/dsh-auto-model discovered from GitHub.
- [dsh-auto-model-router](https://github.com/JianTG/dsh-auto-model-router) — 根据问题复杂度自动切换模型
- [dsh-auto-open-web](https://github.com/jinsiyu/dsh-auto-open-web) — deepseek harness自动打开浏览器插件，内置WebView2程序实现轻量级桌面化。DeepSeek Harness automatically opens browser plugins and includes a built-in WebView2 program to achieve a lightweight desktop experience.
- [dsh-auto-review](https://github.com/AtropinolTT/dsh-auto-review) — DSH Auto Mode — native security review plugin for DeepSeek Harness: pre-execution rule interception + delivery-time independent subagent review. Built for long-running agents.
- [dsh-auto-review](https://github.com/PerryLink/dsh-auto-review) — Second-model AI auto-review for DeepSeek Harness approval requests: a read-only reviewer subagent returns structured allow/deny verdicts with reasons, fail-closed by default, fully auditable from the session log (approval/asked -> autoReview/verdict -> approval/decided).
- [dsh-autogate](https://github.com/wangxing-git/dsh-autogate) — DeepSeek Harness 自动审批插件：在 workspace-write 沙箱之上叠加确定性规则 + LLM 安全审批，自动模式不放宽沙箱、fail-closed。 Safe auto-approval for DeepSeek Harness — deterministic rules + LLM review on top of the workspace-write sandbox. Auto mode without ever granting full-access.
- [dsh-autonomy](https://github.com/abab996/dsh-autonomy) — DSH 自主性切换器：五档滑块按会话调节模型自主性（严格遵循 → 天马行空），提示词注入即时生效、每会话独立记忆
- [dsh-autonomy](https://github.com/JinkaiLiu/dsh-autonomy) — Switch between Chat and Agent without leaving your DeepSeek Harness session.
- [dsh-autopilot](https://github.com/245678000000/dsh-autopilot) — Acceptance-driven autonomous completion for DeepSeek Harness. Done means verified.
- [DSH-AUX](https://github.com/DoloresCaritasAngelus/DSH-AUX) — Auxiliary model system for DeepSeek Harness: unified aux-LLM routing (per-task model, timeout, concurrency, failure cooldown, main-model fallback) + vision_analyze / web_extract / compress_text tools, settings page, and session image lifecycle cleanup.
- [dsh-auxiliary](https://github.com/dsh-plugins/dsh-auxiliary) — Auxiliary models for DeepSeek Harness: vision understanding and context compression through dedicated model routes.
- [dsh-awiki](https://github.com/AgentConnect/dsh-awiki) — AWiki identity and messaging plugin for DeepSeek Harness
- [dsh-background](https://github.com/luoyu-xingu/dsh-background) — DeepSeek Harness Web 背景图片插件:本地图片路径替换网页背景,外观设置行 + 实时预览
- [dsh-background-agents](https://github.com/PerryLink/dsh-background-agents) — Interactive long-session background agents for DeepSeek Harness: start a durable continuable child agent, watch its progress in the Web UI sidebar, message it any time, and interrupt it - all through the official subagent seam.
- [dsh-backup-sync](https://github.com/csiroqa/dsh-backup-sync) — DeepSeek Harness（DSH）备份/恢复 + 跨机同步插件：本地快照、WebDAV 推送/拉取、自动备份与失效归档清理。Snapshot backup, restore and cross-machine sync plugin for DeepSeek Harness: local snapshots, incremental WebDAV push/pull, auto-backup retention and stale archive sweep.
- [dsh-balance](https://github.com/305037991x-pixel/dsh-balance) — DeepSeek account balance chip for DeepSeek Harness Web: 3-min auto refresh with total/topped-up/granted breakdown
- [dsh-balance](https://github.com/crazywoola/dsh-balance) — DeepSeek Harness balance plugin for the Settings page
- [dsh-balance](https://github.com/deepforce/dsh-balance) — DSH plugin: /balance command, composer-dock balance readout with top-up link, session-cost estimate
- [dsh-balance](https://github.com/LemCAE/dsh-balance) — 一个适用于deepseek-harness的插件，功能是显示当前账户余额以及当前会话预估的费用消耗 | A plugin for deepseek-harness that displays the current account balance and the estimated cost consumption of the current session.
- [dsh-balance](https://github.com/linshule/dsh-balance) — DeepSeek API 余额 + OpenCodeGo 余量实时显示插件（dsh web GUI）：可拖拽双段徽章与详情弹层 + DeepSeek/OpenCodeGo 两个设置页；Key 仅存本机 ~/.dsh/ds-balance.json，OpenCodeGo Key 自动读取 DSH 凭据
- [dsh-balance](https://github.com/mxl2498/dsh-balance) — DSH Web 插件：悬浮显示 DeepSeek 账户余额，点击直达充值页 | DSH widget showing your DeepSeek balance with a top-up link
- [dsh-balance](https://github.com/Mystery-God/dsh-balance) — 模型账户余额悬浮窗插件 for DeepSeek Harness Web GUI — floating model-account balance monitor with a settings master switch
- [dsh-balance](https://github.com/qiuyongjin/dsh-balance) — DSH plugin: query and display the DeepSeek account balance (dsh_balance tool + web UI widget)
- [dsh-balance](https://github.com/Shawnxxboxx/dsh-balance) — DSH plugin: show DeepSeek account balance below the conversation · 在对话下方显示 DeepSeek 账户余额
- [dsh-balance](https://github.com/TwotwoPiggy/dsh-balance) — dsh余额插件. A DeepSeek Harness plugin for real-time token tracking and highly accurate session cost estimation, featuring dynamic peak/off-peak pricing support.
- [dsh-balance](https://github.com/Yogioo/dsh-balance) — Yogioo/dsh-balance discovered from GitHub.
- [dsh-balance-bubble](https://github.com/Jescoi/dsh-balance-bubble) — A floating DeepSeek account-balance bubble for the DSH web UI — glassy, draggable, low-balance alert, dark-mode ready.
- [dsh-balance-display](https://github.com/Liu-ty/dsh-balance-display) — DeepSeek API balance overlay for DeepSeek Harness
- [dsh-balance-display](https://github.com/xsuas/dsh-balance-display) — DeepSeek Harness 余额显示插件
- [dsh-balance-display](https://github.com/zhangjianyu1006156/dsh-balance-display) — DeepSeek API 余额显示插件：左下角余额胶囊、低余额预警、余额趋势、一键充值。密钥不出主机端。
- [dsh-balance-float](https://github.com/x2802490130-prog/dsh-balance-float) — DSH 悬浮余额/一键退出插件
- [dsh-balance-guard](https://github.com/DosterBool/dsh-balance-guard) — DeepSeek Harness 插件：状态栏实时余额 + 本会话花费追踪 + 低余额暂停输出并引导充值
- [dsh-balance-meter](https://github.com/healing1/dsh-balance-meter) — healing1/dsh-balance-meter discovered from GitHub.
- [dsh-balance-monitor](https://github.com/jelly-000/dsh-balance-monitor) — DeepSeek 账户余额、剩余比例条与今日花费，显示在 dsh 侧边栏底部 · DeepSeek balance, remaining-ratio bar and today's spend in the dsh sidebar footer.
- [dsh-balance-monitor](https://github.com/Rainronin/dsh-balance-monitor) — 一个好看、简单、实用的余额监视器｜DeepSeek Harness 插件：官方余额快照 + ds_balance 工具 + 峰谷计价区间 + Matrix/原生双风格徽章
- [dsh-balance-plugin](https://github.com/Francis-Xavier-code/dsh-balance-plugin) — deepSeek 余额监控与用量统计（DSH 动态 Cordis 插件）：余额监控 · 官方充值入口 · 用量统计 · 三方插件管理
- [dsh-balance-plugin](https://github.com/r0bert001/dsh-balance-plugin) — Deepseek Harness插件，支持实时展示deepseek余额
- [dsh-balance-stats](https://github.com/pangzi499/dsh-balance-stats) — Balance, session cost, token usage, and invoice summaries for DeepSeek Harness Web.
- [dsh-balance-tide](https://github.com/huanyuLv/dsh-balance-tide) — DeepSeek Harness (DSH) Web 插件: 余额 + 峰谷计价潮汐提示。显示 DeepSeek 账户余额与本会话花费, 并在余额前提示当前峰/谷价格档位、距切换倒计时与使用建议。
- [dsh-balanced-search](https://github.com/tianmingwan/dsh-balanced-search) — Balanced web search plugin/MCP server for DeepSeek Harness: Keenable / Exa / Tavily round-robin with failover. / 均衡搜索插件：Keenable / Exa / Tavily 轮流调用，自动故障切换。
- [dsh-ballute](https://github.com/Zlyraz/dsh-ballute) — Zlyraz/dsh-ballute discovered from GitHub.
- [dsh-baoyu-skills](https://github.com/GongYuanCaiJi/dsh-baoyu-skills) — 宝玉技能库（移植自 JimLiu/baoyu-skills）
- [dsh-bash-rtk](https://github.com/DeepTrial/dsh-bash-rtk) — DeepSeek Harness bash executor plugin that routes eligible commands through rtk (Rust Token Killer) to compress tool output and save tokens.
- [dsh-bash-win](https://github.com/zimzaza4/dsh-bash-win) — 在 Windows 环境中为 DeepSeek Harness 提供 Git Bash 与 WSL 2 bash 工具,含 bwrap 沙箱、审批模式、后台任务
- [DSH-Basic-Right-Sidebar](https://github.com/xinspark/DSH-Basic-Right-Sidebar) — Basic Right Sidebar — a right sidebar plugin for DeepSeek Harness: two-level navigation (Functions / Sessions), workspace/session breadcrumb, session overview with log download, native trajectory view, and configurable topbar decluttering.
- [dsh-Basics-Panel](https://github.com/yxsj245/dsh-Basics-Panel) — DSH Web 插件「基础能力面板」：在 DSH 设置中可视化并管理 MCP 服务器、技能 与 规则。采用模块化 feature 注册表，后续的 DSH 可视化功能只需新增一个 feature 目录并在注册表加一行即可，无需改动面板骨架。
- [dsh-batch-regression](https://github.com/PangYiMing/dsh-batch-regression) — DSH plugin: run a command N rounds, judge by median/distribution — 批量回归取统计结论
- [dsh-beacons](https://github.com/Da-Mie/dsh-beacons) — Right-edge prompt navigator (Codex/OpenChamber-style scrub rail with scroll-spy) plus Windows toast notifications — a DeepSeek Harness plugin
- [dsh-bell-notify](https://github.com/Laplace-bit/dsh-bell-notify) — DeepSeek Harness (dsh) 社区插件：为 Agent 生命周期事件合成铃声 + 右下角呼吸状态点，每个事件可上传自定义音频。dsh plugin that rings bells and shows a breathing status dot for Agent lifecycle events.
- [dsh-benchmark](https://github.com/dongsheng123132/dsh-benchmark) — Deterministic revision-pinned benchmarks and regression evidence for DeepSeek Harness
- [dsh-better-archive](https://github.com/huahai0202/dsh-better-archive) — DeepSeek Harness (DSH) web-GUI plugin: archived-session panel with unarchive & delete
- [dsh-better-browser](https://github.com/titanwings/dsh-better-browser) — DSH 真实浏览器插件：通过 Kimi WebBridge 让 Agent 操作用户已登录的浏览器，并提供 13 个 webbridge_* 工具。 / Let DSH Agents use your signed-in browser through thirteen Kimi WebBridge tools.
- [dsh-better-chat-history](https://github.com/echo-xianyu/dsh-better-chat-history) — A plugin for DSH to optimize session loading speed and reduce disk read/write consumption.
- [dsh-better-codex-subagent](https://github.com/ivwumupy/dsh-better-codex-subagent) — ivwumupy/dsh-better-codex-subagent discovered from GitHub.
- [dsh-better-deepseek](https://github.com/EdgeTypE/dsh-better-deepseek) — DeepSeek Harness bridge plugin for Better DeepSeek Chrome extension.
- [dsh-better-edit](https://github.com/Rianico/dsh-better-edit) — Hash-anchored read/edit/batch_edit/undo_last_edit tools for DeepSeek Harness (dsh) — dsh port of pi-hashline-edit-lsz
- [dsh-better-markdown](https://github.com/zerob13/dsh-better-markdown) — DeepSeek Harness Web plugin powered by markstream-react for resilient streaming Markdown, Mermaid diagrams, KaTeX math, and safe renderer fallback.
- [dsh-better-model-selector](https://github.com/Khellendros97/dsh-better-model-selector) — 将模型选择器和思考强度选择器拆成两个组件，并替换为更合理的交互方式
- [dsh-better-plan-reviewer](https://github.com/Khellendros97/dsh-better-plan-reviewer) — 更好的plan确认窗口，可以替换执行模型、暂存计划
- [dsh-better-sidebar-lite](https://github.com/pixellover1433/dsh-better-sidebar-lite) — a simple plugin to improve web UX/UI for "Deepseek Harness (dsh)"
- [dsh-better-status](https://github.com/Yaing-Yan/dsh-better-status) — DeepSeek Harness 插件：把文本形式的会话统计（轮/步、LLM/工具耗时、首 token、tok/s、缓存命中、输入/输出 token）替换为页面右侧直观醒目的图表面板。
- [dsh-bgwall-plugin](https://github.com/hubo980205/dsh-bgwall-plugin) — hubo980205/dsh-bgwall-plugin discovered from GitHub.
- [dsh-bib](https://github.com/youyli03/dsh-bib) — Embed a controllable real-browser viewport inside DeepSeek Harness — shared by humans and AI agents via an Edge extension + local relay bridge.
- [dsh-bili-taskmaster](https://github.com/jokerwen666/dsh-bili-taskmaster) — 等你的小鲸鱼跑任务时随机播放b站视频，愉快做监工
- [dsh-bili-widget](https://github.com/pyf2818/dsh-bili-widget) — 🎬 DSH (DeepSeek Harness) B站悬浮看片插件：边 coding 边刷视频。推荐/热门/排行/搜索/关注UP主、自动连播、迷你模式、历史持久化
- [dsh-bilibili](https://github.com/CZX2244/dsh-bilibili) — CZX2244/dsh-bilibili discovered from GitHub.
- [dsh-bilibili](https://github.com/moxingovo/dsh-bilibili) — DeepSeek Harness plugin: Bilibili video search, metadata, and subtitle transcripts (bilibili_search / bilibili_video / bilibili_subtitles) · DeepSeek Harness 插件:B 站视频检索、元数据与字幕文稿,匿名可用,可选 SESSDATA 解锁登录字幕
- [dsh-bill](https://github.com/Jannchie/dsh-bill) — DSH (DeepSeek Harness) plugin: per-session cost line + cost attribution report, priced by llm-pricing
- [dsh-billing](https://github.com/nianpangzhi233/dsh-billing) — DSH web GUI realtime billing monitor: token/cost metering, DeepSeek v4 peak pricing, balance anchoring, sidebar pill + settings page, billing_balance agent tool
- [dsh-billing](https://github.com/TheTianzz/dsh-billing) — DeepSeek Harness plugin: 账户余额 + 会话费用（/balance /cost 命令、deepseek_billing 工具、Web UI 双胶囊），官方价格每 12 小时自动同步
- [dsh-billing](https://github.com/Wanbinyu/dsh-billing) — Wanbinyu/dsh-billing discovered from GitHub.
- [dsh-billing-glass](https://github.com/linkingoscar/dsh-billing-glass) — Liquid-glass billing overlay for the DeepSeek Harness Web GUI: provider balances, session cost, daily spend and token buckets. DeepSeek-first and extensible.
- [dsh-bio-genie](https://github.com/moonbowterfly/dsh-bio-genie) — 🧬 dsh bio analysis plugin for DeepSeek Harness — wish-style bioinformatics & biology analysis: Biopython-powered sequence analysis, genomics, zero-install Python env (uv+venv)
- [dsh-biomemory](https://github.com/KLRSL/dsh-biomemory) — 生物仿生记忆系统插件：Biomimetic memory for DeepSeek Harness — transparent Markdown memory, approval-gated writes, frozen snapshot injection
- [dsh-birdman-plugins](https://github.com/birdman1992/dsh-birdman-plugins) — Community plugins for DeepSeek Harness (DSH): model metadata autofill and workspace artifacts view.
- [dsh-bisect-debug](https://github.com/PangYiMing/dsh-bisect-debug) — DSH plugin: bisect bugs (code / boundary / commit) — 二分法定位 bug 根因
- [dsh-black-whale](https://github.com/147228/dsh-black-whale) — DeepSeek Harness 黑鲸实验室主题：官网黑鲸 × 夕小瑶 IP，真实 profile 可安装的 Web UI 插件
- [dsh-blackhole](https://github.com/Asaiuta/dsh-blackhole) — Asaiuta/dsh-blackhole discovered from GitHub.
- [dsh-blackjack](https://github.com/WhiseNT/dsh-blackjack) — 谁不想coding的时候急头白脸的和大肥鱼来一场紧张刺激的21点呢
- [dsh-blue-archive-shiroko](https://github.com/mldhao/dsh-blue-archive-shiroko) — Blue Archive-inspired DSH theme with a Shiroko desktop companion, Codex-style reply bubbles, petting effects, and completion chime.
- [dsh-blue-whale](https://github.com/starslittle/dsh-blue-whale) — 复刻 DeepSeek Chat 蓝鲸配色的皮肤，亮色/深色跟随系统外观。
- [dsh-blue-whale-maid](https://github.com/yuxino/dsh-blue-whale-maid) — 运行在 deepseek harness 上的女仆酱
- [dsh-board](https://github.com/dfkai/dsh-board) — DeepSeek Harness 侧栏用量与成本面板：官方峰谷计价 · 1M 上下文 · 词勋段位 · 成就与热力图
- [dsh-book2skill](https://github.com/omdsh-dev/dsh-book2skill) — DSH book-to-skill plugin: a 5-stage long task (fetch → parse → understand → generate → install) with 3 human gates, host tools for the agent and a browser timeline panel
- [dsh-bookmarks](https://github.com/penguin-oo/dsh-bookmarks) — Bookmark assistant replies in DeepSeek Harness: per-message bookmarks with notes/tags, a cross-session center, and one-click Markdown export.
- [dsh-boot-guard](https://github.com/SaiSenBox/dsh-boot-guard) — A loader-independent rescue console for DeepSeek Harness when a broken plugin prevents the Web UI from starting.
- [dsh-bottom-bar](https://github.com/kc0ed/dsh-bottom-bar) — 用于提供更丰富的DeepSeek Harness底栏信息显示插件
- [dsh-bottom-info-bar](https://github.com/songoao25/dsh-bottom-info-bar) — Bottom Info Bar — an information bar plugin for DeepSeek Harness: provider/model, live balance, peak/off-peak pricing with countdown, and real persisted per-session spend in a single line.
- [dsh-bottom-stats](https://github.com/318197375/dsh-bottom-stats) — DSH plugin: full-width conversation stats line (no truncation) + context occupancy progress bar for the DeepSeek Harness web UI
- [dsh-bridges](https://github.com/yhlooo/dsh-bridges) — 将 DeepSeek Harness 桥接到已配置其它 Harness Agent 的项目。支持 CodeBuddy / Codex / OpenCode / Claude Code / ...
- [dsh-bring-local-llm](https://github.com/Hed1an/dsh-bring-local-llm) — 让本地 LLM(Ollama/KoboldCpp/LM Studio/任意 OpenAI 兼容端点)接入 DeepSeek Harness，本地优先处理一部分信息，难点交给云端主模型：省在线 token、用上本地冗余算力。
- [dsh-browser](https://github.com/ben7am1n/dsh-browser) — Playwright-powered browser automation for DeepSeek Harness
- [dsh-browser](https://github.com/duyefeng/dsh-browser) — 给 DeepSeek Harness 的浏览器插件：AI 直接开真实的 Edge 浏览器逛网页、点击、填表、截图，无需 CDP 或 MCP。
- [dsh-browser](https://github.com/wqty123/dsh-browser) — Shared real browser plugin for DeepSeek Harness
- [dsh-browser](https://github.com/xylt369/dsh-browser) — Browser capability for DeepSeek Harness: headed Edge/Playwright provider, SSRF-safe navigation, a11y-ref clicking, permission gate with auto-remember, gated evaluate
- [dsh-browser-bridge](https://github.com/ycp424c/dsh-browser-bridge) — Prompt-scoped bridge between DSH and explicitly attached Chrome tabs
- [dsh-browser-companion](https://github.com/Tianyu209/dsh-browser-companion) — A personal DSH browser plugin: persistent profile, visible window, human-in-the-loop login, and safe agent browser tools.
- [dsh-browser-control](https://github.com/kyo615/dsh-browser-control) — Let an AI control a real visible Chrome browser via Playwright MCP, with a live view of every action inside the DeepSeek Harness GUI.
- [dsh-browser-control](https://github.com/PangYiMing/dsh-browser-control) — DSH plugin for controlling browsers (CDP/Playwright) — DeepSeek Harness 操控浏览器插件
- [dsh-browser-fs](https://github.com/whitefirer/dsh-browser-fs) — dsh（DeepSeek Harness）插件：让 agent 读写浏览器所在机器的本地文件——File System Access 授权 + WS 中继，含非安全上下文兼容模式
- [dsh-browser-playwright](https://github.com/ChenyuHeee/dsh-browser-playwright) — Snapshot-first Playwright browser automation for DeepSeek Harness: accessibility-tree interaction with stable refs, per-session browser contexts, 17 browser_* tools.
- [dsh-browseruse](https://github.com/yzd6552-commits/dsh-browseruse) — browser-use style browser automation plugin for DeepSeek Harness: drives a dedicated Chrome instance (persistent profile) via playwright-core — fine-grained tools, autonomous tasks, scheduling, dangerous-action confirmation, captcha hand-off
- [dsh-btw](https://github.com/iyllyt/dsh-btw) — 个人很喜欢 Claude Code 的 /btw，于是为 DSH 做了复刻：共享当前上下文快速旁路提问，不中断主任务，也不写入主会话历史。
- [dsh-build-diff](https://github.com/KeLearns/dsh-build-diff) — Agent-loop change review for the DeepSeek Harness web GUI
- [dsh-bundle-updater](https://github.com/hyls9527/dsh-bundle-updater) — DSH 整合包插件管理器：检查更新 / 搜索 / 安装 / 卸载 / 安全审计（npm / GitHub / 本地链接）｜Full-lifecycle plugin manager for DSH profile bundles
- [dsh-bundle-vision](https://github.com/skillre/dsh-bundle-vision) — Zero-core-change vision capability for DeepSeek Harness: the describe_image tool + profile bundle, installable via 'dsh plugin add'
- [dsh-cache-hit-decimal](https://github.com/Yuuu0109/dsh-cache-hit-decimal) — Two-decimal cache-hit rate for the DeepSeek Harness Web GUI
- [DSH-Cache-Hit-Precision](https://github.com/luern0313/DSH-Cache-Hit-Precision) — dsh状态栏显示两位小数缓存命中率
- [dsh-cache-precision](https://github.com/Cheng-cheng9669/dsh-cache-precision) — DSH client plugin: render the built-in session cache-hit percentage with three decimal places.
- [dsh-cache-stabilizer](https://github.com/dongsheng123132/dsh-cache-stabilizer) — Cache-prefix stabilization and evidence-based cache metrics for DeepSeek Harness
- [dsh-cad-review](https://github.com/dongsheng123132/dsh-cad-review) — Evidence-first ASCII DXF inspection and deterministic CAD rule review for DeepSeek Harness
- [dsh-calendar](https://github.com/STARDUSTLC666/dsh-calendar) — DeepSeek Harness 日历插件：calendar_list/create/update/delete/search 五工具，CalDAV 协议支持 Google/iCloud/Nextcloud/自定义端点，RRULE 重复事件自动展开，插件级 proxyUrl 代理，配置缺失不崩启动；纯 Node 全平台。· CalDAV calendar tools for DeepSeek Harness agents.
- [dsh-capability-index](https://github.com/777-Zen/dsh-capability-index) — 给 DSH agent 的插件库"起飞前检查单"——任务型请求时自动预检插件库并注入 Top-K 适用插件提示，让插件库利用率可预期、不靠运气。Pre-flight plugin-library check for DSH agents — task-type requests trigger a Top-K hint of suitable plugins injected into the runtime context, making plugin usage predictable instead of opportunistic.
- [dsh-capability-inspector](https://github.com/tree201/dsh-capability-inspector) — DeepSeek Harness Doctor and DSH runtime diagnostics for tools, models, skills, workspaces, sessions, plugins, and MCP troubleshooting
- [dsh-capability-receipt](https://github.com/dongsheng123132/dsh-capability-receipt) — Content-addressed receipts for skills actually loaded by DeepSeek Harness
- [dsh-capsule](https://github.com/2-c-q/dsh-capsule) — OS-isolated capability capsules for third-party DeepSeek Harness plugins
- [dsh-captain](https://github.com/KanoNoUta/dsh-captain) — Captain plugin for DeepSeek Harness: GPT planning, DeepSeek workers, independent review, adaptive multi-agent orchestration
- [dsh-case](https://github.com/ZhijiangTang/dsh-case) — DSH plugin: naming case converter (camelCase/snake_case/kebab-case/PascalCase/...)
- [dsh-catgirl-plugin](https://github.com/Freakz2z/dsh-catgirl-plugin) — A token-efficient persona runtime for DeepSeek Harness. 把人格留在界面，把智能留给模型。Measured: -67% input tokens, -66% cache reads, 0-token catgirl rendering.
- [dsh-catnap-studio](https://github.com/luoyan96/dsh-catnap-studio) — Cat-themed DeepSeek Harness Web UI plugin with three original themes and a calm interactive companion. Not an official DeepSeek product.
- [dsh-catppuccin](https://github.com/NoNameLeGo/dsh-catppuccin) — DeepSeek Harness Web GUI 的 Catppuccin 主题插件：Latte / Frappé / Macchiato / Mocha 四种主题一键切换，内置可开关的玻璃质感（Glassmorphism）
- [dsh-cbx-orch](https://github.com/zerosloney/dsh-cbx-orch) — Durable coding-agent orchestrator as a DeepSeek Harness plugin: dispatch tasks to codebuddy/opencode/omp/cline/qwen with persistent jobs, queue, review, and rollback.
- [dsh-cc-ecosystem](https://github.com/Bcy2020/dsh-cc-ecosystem) — 让 DeepSeek Harness 用上 Claude Code 全家桶:技能、命令、规则、权限、子代理、hooks—— .claude/ 资产原样加载,正在逐步做到全兼容。
- [dsh-cc-haha-memory](https://github.com/yihefeikong-rgb/dsh-cc-haha-memory) — CC-HAHA-inspired persistent memory plugin for DeepSeek Harness (DSH)
- [dsh-cc-import](https://github.com/Mreate/dsh-cc-import) — Import high-quality conversations into Claude Code and provide CLAUDE.md recognition, add basic features like the "/init" command, and help speed up migration progress | 高质量导入Claude Code中的对话，并提供CLAUDE.md识别，添加"/init"命令等基础功能，帮助快速迁移进度
- [dsh-cc-suite](https://github.com/AS17514/dsh-cc-suite) — AS17514/dsh-cc-suite discovered from GitHub.
- [dsh-cc-switch](https://github.com/LKRCharon/dsh-cc-switch) — Sync cc-switch provider profiles into DeepSeek Harness (DSH) model routes — CLI, slash command, and agent tool
- [dsh-cdp-browser](https://github.com/zaiwenJ/dsh-cdp-browser) — Zero-spawn CDP browser control plugin for DeepSeek Harness: screenshots, pixel assertions, page JS — no vision model, no per-use approval
- [dsh-chain-toggle-all](https://github.com/NekoDD-wow/dsh-chain-toggle-all) — DSH Web GUI plugin: one-click expand/collapse all reasoning chains and tool chains in the current session
- [dsh-chameleon](https://github.com/lsz-asd/dsh-chameleon) — lsz-asd/dsh-chameleon discovered from GitHub.
- *其余 2807 个待分类插件未在此列出，可在[在线网站](https://deepseek1024.com/)搜索或浏览完整目录。*

</details>

## 免责声明

本项目是社区维护的插件索引。插件由各自作者开发和维护，收录不构成安全、质量或维护状态背书。安装插件会在本机运行第三方代码，请在安装前自行审阅源码和依赖。

## 许可证

本仓库采用分区许可：

- 应用、自动化与构建工具等源代码采用 [MIT License](LICENSE)。
- `catalog/` 下的插件目录元数据采用 [CC0-1.0](catalog/LICENSE)。
- 初始目录数据导入自 `awesome-dsh-plugin`，来源和导入提交见 [catalog/ATTRIBUTION.md](catalog/ATTRIBUTION.md)。

目录中列出的第三方插件不属于本仓库，其源代码分别遵循各自仓库的许可证。
