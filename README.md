# DSH 1024Store

<!-- 本文件由 scripts/build-readme.mjs 从 deepseek1024.com 目录 API 自动生成，请勿手工编辑。 -->

面向 [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness)（`dsh`）生态的社区插件目录，共收录 **3926** 个插件（含 PR 收录与 GitHub `dsh-plugin` topic 自动发现），目录数据更新于 2026-08-16。

**但这个仓库不只是一份 awesome list。** 维护这份目录所需要的全部基建都在这里开源：一个在线插件市场、一个把市场装进 `dsh` 本体的插件、一条定时自动收集并做格式校验的目录流水线，以及一套免费的公开查询 API。代码采用 MIT 协议，fork 之后就能部署成你自己的插件市场。

[![DSH 1024Store 插件市场首页](https://raw.githubusercontent.com/imsai-sh/awesome-deepseek-harness-plugins/assets/homepage.zh.png?v=efe3f508a26b)](https://deepseek1024.com/)

[在线网站](https://deepseek1024.com/) · [API 文档](docs/api.md) · [英文目录](catalog/README.md) · [提交插件](CONTRIBUTING.md)

[![GitHub Stars](https://img.shields.io/github/stars/imsai-sh/awesome-deepseek-harness-plugins?style=social)](https://github.com/imsai-sh/awesome-deepseek-harness-plugins/stargazers)

## 项目亮点

### 在线插件市场（开源 · 可一键自部署）

[deepseek1024.com](https://deepseek1024.com/) 提供搜索、分类筛选、安装排行榜、插件详情与 GitHub 活跃度数据。整站跑在 Cloudflare Workers + D1 + KV 上，源码在 [`apps/web`](apps/web)。

想要一个完全属于自己的插件市场：fork 本仓库，把 `apps/web/wrangler.jsonc` 里的 `routes` 换成你自己的域名，创建 D1 数据库与 KV 命名空间，配齐 `secrets.required` 列出的 Worker secret，再把 `CLOUDFLARE_API_TOKEN` 与 `CLOUDFLARE_ACCOUNT_ID` 存为仓库 secret。配置完成后，每次 push 到 `main` 都由 GitHub Actions 自动执行 D1 迁移并部署 Worker，不需要自己写一行部署脚本。完整步骤见下文[本地运行与部署](#本地运行与部署)。

### 把插件市场装进 dsh 本体

不想切浏览器，就把市场本身作为插件装进 DeepSeek Harness：

```bash
dsh plugin --profile web add dsh1024
```

重启后「设置」里会出现独立的 **1024 Store** 入口，「设置 → 插件」下也会多出一个 **1024 Store（数量）** 标签页，可以直接搜索目录、按分类筛选、识别已安装状态、安装与卸载，并显示操作进度。安装器只接受目录中已校验过的仓库地址，并自行推导 `github:owner/repository`，不会执行目录返回的展示命令。源码见 [`packages/dsh1024`](packages/dsh1024)。

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
dsh1024 plugin --profile web add github:<owner>/<repository>
```

首次使用先一次性全局安装：`npm install -g dsh1024`。它与官方命令只差一个名字——`plugin` 之后的参数原样转发给官方 CLI，不增删、不改写、不重排，包装器只负责在结束后核对 profile 并记录一条匿名安装结果。参数不会写入遥测或本地 receipt。

monorepo 子目录插件的标识形如 `owner/repo/packages/foo`，对应的安装 spec 是官方的 `github:owner/repo#path:packages/foo`，同仓库的兄弟插件各自独立计数。

统计身份是保存在 `$DSH_HOME/.dsh-1024store/` 的随机安装实例 ID，不是实名用户或账号。CLI 不上传命令输出、路径、用户名、环境变量、会话内容或原始错误；可用 `npx dsh1024 telemetry disable`、`DO_NOT_TRACK=1` 或 `DSH1024_TELEMETRY=0`（旧变量名 `DSH_1024STORE_TELEMETRY` 仍兼容）关闭。直接使用官方 `dsh plugin` 命令仍然可用，但不会计入 DSH 1024Store 安装统计。详细字段、口径、存储和部署方式见 [安装统计设计](docs/install-analytics.md)，CLI 源码见 [`packages/dsh1024`](packages/dsh1024)。

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

安装命令：`dsh1024 plugin --profile web add github:<owner>/<repository>[#path:<sub/dir>]`（首次使用先 `npm install -g dsh1024`）。

## 项目定位

本项目与 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 都服务于 DeepSeek Harness 插件生态。在继承其目录数据与社区整理思路的基础上，本项目把「一份人工维护的列表」扩展成一套开源、可自部署的插件市场基建：自动发现与静态校验的目录流水线、在线市场网站、dsh 内置市场插件与免费查询 API，具体见上文[项目亮点](#项目亮点)。

## 项目结构

```text
catalog/plugins/    插件提交表单与 curated 元数据（每个插件一个 JSON）
catalog/categories.json  分类定义（唯一分类信源）
skills/             面向贡献者的可安装 Agent Skills
apps/web/src/       React + Vite 前端
apps/web/worker/    Cloudflare Worker API 与数据刷新（唯一读写 D1 的进程）
packages/dsh1024/   dsh1024 npm 包：上报安装统计的包装 CLI + DSH 设置页内插件市场
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

- [UI 增强](#ui) (185)
- [主题与外观](#theme) (34)
- [会话与消息](#session) (57)
- [记忆](#memory) (39)
- [工具与能力](#tools) (210)
- [技能包](#skill) (45)
- [工作流与自动化](#workflow) (54)
- [通知与集成](#notify) (44)
- [模型与账号接入](#model) (48)
- [开发与运行时](#dev) (106)
- [娱乐](#fun) (49)
- [待分类](#unclassified) (3055)

<a id="ui"></a>

<details>
<summary><strong>UI 增强</strong> · 185 个插件</summary>

- [awesome-deepseek-harness-plugins](https://github.com/imsai-sh/awesome-deepseek-harness-plugins) — 提供插件商店与中心，支持搜索、排行、安装命令及免费公共 API。
- [context-vista](https://github.com/GooodWei/context-vista) — 为 DeepSeek Harness 提供右侧悬浮栏以及 /context 命令，用环形图实时展示当前上下文 token 用量与分配，compact指令效果，同时支持估算费用消耗，对标 Claude Code 的 /context。
- [deepseek-design](https://github.com/Devin-AXIS/deepseek-design) — DeepSeek Harness 可编辑设计系统：AI 生成、可视化编辑、模板市场与 PPT｜Native Design & PPT Studio for DeepSeek Harness.
- [Deepseek-Harness-as-Desktop](https://github.com/KhanZou/Deepseek-Harness-as-Desktop) — 将 harness 变为桌面应用，支持原生外壳、系统托盘与开机自启。
- [deepseek-harness-desktop](https://github.com/ningbainb/deepseek-harness-desktop) — 开源Windows桌面客户端，为DeepSeek Harness提供零配置安装、Codex支持、插件、SSH和11款皮肤。
- [DeepSeek-Harness-Desktop](https://github.com/Muelsysel/DeepSeek-Harness-Desktop) — 在DSH网页界面上提供原生桌面窗口，方便访问。
- [deepseek-harness-genui](https://github.com/pengyue-polaron/deepseek-harness-genui) — 通过代码描述生成用户界面，实现代码优先的 UI 构建方式。
- [DeepSeek-Harness-linux-](https://github.com/MoneShadow/DeepSeek-Harness-linux-) — 一个基于官方WebUI二改的Linux桌面端，内置了一个外挂视觉插件(需手动接入API Key)，已经迭代了四个版本，可能还是有些小毛病，不过目前用下来暂时没有什么大问题。
- [deepseek-harness-tui](https://github.com/gxinxing/deepseek-harness-tui) — 提供基于 Ink 和 React 的终端交互界面，方便浏览 DeepSeek Harness。
- [deepseek-harness-tui](https://github.com/openma-ai/deepseek-harness-tui) — Rust/ratatui 终端客户端，直接使用 DSH SDK JSON-RPC 协议，支持独立运行或作为 profile bundle 加载。
- [deepseek-harness-zh_pro](https://github.com/magian1127/deepseek-harness-zh_pro) — 为 DSH 提供中文增强与本地化改进。
- [deepseek-plugin-store](https://github.com/Ericwong5021/deepseek-plugin-store) — DeepSeek Harness 独立社区插件商店：发现、安装并提交经过验证的插件、工具与扩展。 | Independent community plugin directory.
- [ds-api-usage](https://github.com/Sev7een/ds-api-usage) — 在设置页展示 DeepSeek API 余额与最近 24 小时用量，包括估算消费、Token、请求次数和按小时时间线。
- [dsh-101](https://github.com/bill9109/dsh-101) — DSH 文档阅读模式。
- [dsh-annotation](https://github.com/omdsh-dev/dsh-annotation) — 选中文字→批注→随消息发送，回复按批注逐条对照。
- [dsh-answer-pet](https://github.com/Nanki-nn/dsh-answer-pet) — 蓝鲸桌面宠物：按会话实时展示回答进度、模型动作与工具调用轨迹、token、输出速率与耗时，并支持多会话状态卡片展开和收起。
- [dsh-at-file](https://github.com/omdsh-dev/dsh-at-file) — Codex 风格的 `@file` 文件引用，输入框里直接搜索并引用工作区文件。
- [dsh-attachments](https://github.com/LCYLYM/dsh-attachments) — 为 DSH WebUI 提供跨平台的多媒体输入和工作区附件功能。
- [dsh-auto-continue](https://github.com/HsiangNianian/dsh-auto-continue) — DSH Web 请求中断自动续跑：网络、超时或宿主崩溃等非人为失败后自动发送「继续」，支持错误分类、自适应退避、模板化继续文本与浏览器通知。
- [dsh-balance](https://github.com/LemCAE/dsh-balance) — 一个适用于deepseek-harness的插件，功能是显示当前账户余额以及当前会话预估的费用消耗 | A plugin for deepseek-harness that displays the current account balance and the estimated cost consumption of the current session.
- [dsh-balance-meter](https://github.com/Ghost011118/dsh-balance-meter) — 输入框 dock 显示 DeepSeek 账户余额与会话花费，自动拉取官方定价，支持高峰/低谷计价。
- [dsh-balance-monitor](https://github.com/jelly-000/dsh-balance-monitor) — DeepSeek 账户余额、剩余比例条与今日花费，显示在 dsh 侧边栏底部 · DeepSeek balance, remaining-ratio bar and today's spend in the dsh sidebar footer.
- [dsh-balance-plugin](https://github.com/luokai-demo/dsh-plugins) — 侧栏底部显示 DeepSeek 钱包余额：信用卡图标按余额着色（¥2 以上绿色、¥0–2 琥珀色、更低红色），加载、回合结束和点击时刷新；余额变化时浮现带符号的增减量并淡出。
- [dsh-balance-plugin](https://github.com/stevenx65/dsh-balance-plugin) — dsh 网页侧边栏的 DeepSeek 余额与 token 用量监控：今日/累计切换，并按 provider 过滤其他厂商。
- [DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) — 侧边栏完整工作台：内置文件渲染编辑、终端、Git 与子代理，支持三方插件注册新 Tab。
- [dsh-board](https://github.com/dfkai/dsh-board) — DeepSeek Harness 侧栏用量与成本面板：官方峰谷计价 · 1M 上下文 · 词勋段位 · 成就与热力图
- [dsh-bottom-bar](https://github.com/kc0ed/dsh-bottom-bar) — 用于提供更丰富的DeepSeek Harness底栏信息显示插件
- [dsh-bottom-info-bar](https://github.com/songoao25/dsh-bottom-info-bar) — 在底部信息栏显示提供商/模型、实时余额、峰谷定价倒计时和每次会话花费。
- [dsh-builtin-toggles](https://github.com/Starfie1d1272/dsh-builtin-toggles) — 为 DSH Web 添加官方内置插件目录、搜索与状态说明，并提供经过审核的安全 UI 插件开关。
- [dsh-calculator](https://github.com/bobcat848/dsh-calculator) — 右侧面板展示 DeepSeek API 费用（当前会话 + 全部会话累计）与账户余额，内置官方计价与峰谷计价支持。
- [dsh-chat-outline](https://github.com/liliuCourier/dsh-chat-outline) — 对话栏左侧常驻大纲：按轮次列出提问与最后回复，支持关键词过滤与一键跳转。
- [dsh-chat-timeline](https://github.com/jjxjjjjiik-bot/dsh-chat-timeline) — 添加右侧聊天导航栏，类似 DeepSeek 官方网页界面，方便浏览会话。
- [dsh-client-ui-mobile-adapt](https://github.com/Hotsteel2901/dsh-client-ui-mobile-adapt) — 为手机重制 Web 界面，采用单列布局和全屏设置。
- [dsh-code](https://github.com/UNLINEARITY/dsh-code) — Claude-Code-style TUI bundle for DeepSeek Harness. 充分结合 DSH 的核心机制与Codex CLI 、Claude Code 的优秀机制，打造的 DSH-Code. （注：支持DSH 特殊模式，插件系统，模型管理，Deepseek 官方 API 特殊动画）
- [dsh-composer-polish](https://github.com/tianji-qingtian/dsh-composer-polish) — 为输入框草稿提供一键润色，通过 flash 改写并自动回填。
- [dsh-composer-tools](https://github.com/wsxwj123/dsh-plugins) — 输入框工具集：方向键翻阅会话历史（限首行/末行触发，兼容输入法与命令菜单）及相关输入便利功能。
- [dsh-cost-meter](https://github.com/Han-1413141/dsh-cost-meter) — 会话与当日 API 费用统计、预算图框（已用%）、官方余额、历史看板，支持峰谷计价与官方价格一键同步。
- [dsh-cost-meter](https://github.com/Sttrevens/dsh-cost-meter) — Web UI 美元成本徽标：头部显示会话总成本、每条回复结尾显示该轮成本，悬停看分项。
- [dsh-cyber-particle](https://github.com/AKS1st/dsh-cyber-particle) — 为 DeepSeek Harness 网页界面添加动态粒子网络背景，增强视觉效果。
- [dsh-dafeiyu](https://github.com/QCYTSN/dsh-dafeiyu) — 桌面原生陪伴工具，在Windows上实时显示代理状态并保持置顶。
- [dsh-deeplink](https://github.com/qyw233/dsh-deeplink) — `?session=` / `?workspace=` 深链直达指定项目对话。
- [dsh-deepseek-billing](https://github.com/Jolly-J/dsh-deepseek-billing) — 在 Web UI 侧边栏显示 DeepSeek 账户余额和当前会话费用估算。
- [DSH-Deeptop](https://github.com/Sparrived/DSH-Deeptop) — 轻量原生桌面客户端，将 DeepSeek Harness 桥接到独立桌面环境。
- [dsh-desktop](https://github.com/yxccai/dsh-desktop) — 非官方桌面应用，内置运行时并复用现有 DSH 环境。
- [dsh-diff-viewer](https://github.com/lehhair/dsh-diff-viewer) — PiUI 风格 diff 查看器，替换 write/edit 工具调用的默认 DiffBlock。
- [dsh-download-progress](https://github.com/Fro2en12/dsh-download-progress) — DSH web plugin: 下载进度面板（AI 产物）
- [dsh-drag-and-drop](https://github.com/AKIRACOD/dsh-drag-and-drop) — 拖放 fork：文档以可删除「文件芯片」挂在输入框上方，不打字也能发送。
- [dsh-drag-and-drop](https://github.com/bill9109/dsh-drag-and-drop) — 跨平台文件拖拽与原始路径插入，无需复制文件。
- [dsh-drop-to-path](https://github.com/loudMore/dsh-drop-to-path) — DSH 插件:图片与文件直达纯文本模型——图片保留原生附件体验,PDF/Office/压缩包/视频/音频显示为附件栏方块,点击发送时自动转为工作区路径,配合 dsh-vision-toolkit 粘贴即看图。A DSH plugin that delivers images AND files to text-only models as workspace paths: images keep the native attachment UI, other files show as square chips in the rail, paths append on send — pairs with dsh-vision-toolkit.
- [dsh-explorer](https://github.com/No-PRM/dsh-explorer) — 添加VS Code风格文件树，含Git装饰、预览和拖拽引用。
- [dsh-file-explorer](https://github.com/joejojoking-cloud/dsh-file-explorer) — 提供文件树、预览、语法高亮和面板内编辑，并集成 VS Code。
- [dsh-file-mentions](https://github.com/a903067276-rgb/dsh-file-mentions) — DSH 回复中的文件路径可点击：Codex 风格行内打开、文件管理器定位、回合尾部文件 chip 列表。
- [dsh-file-panel](https://github.com/yu2025-luo/dsh-file-panel) — 在右侧面板显示已创建或下载文件的预览与操作。
- [dsh-file-upload](https://github.com/GLFzr/dsh-file-upload) — DSH 拖拽文件转路径插件：Codex 式拖拽，路径自动插入输入框（Drop File to Path for DeepSeek Harness）
- [dsh-file-uploads](https://github.com/l541402398/dsh-file-uploads) — 从 Web 输入框上传任意本地文件，以待发送卡片展示，并在设置中管理已存文件。
- [dsh-files](https://github.com/taxueseek/dsh-files) — 文件上传（彩色附件卡片、会话隔离存储、sha256 去重、TTL 清扫）+ 内容嗅探的 read_document 文档读取（PDF/DOCX/XLSX/TXT）。
- [dsh-focus-chat](https://github.com/dingyi222666/dsh-focus-chat) — 「聚焦会话」精简视图，只关注最终产出结果。
- [dsh-font](https://github.com/tianyhjg-lab/dsh-font) — 切换 Web 界面字体，提供 99 种 UI 和 31 种代码字体，支持中英文配对。
- [dsh-gadgets](https://github.com/Highjobop/dsh-gadgets) — 提供外观切换和对话整理等轻量优化，包含皮肤切换器与消息折叠导航栏。
- [dsh-gauge](https://github.com/noone89A/dsh-gauge) — 为 DeepSeek Harness Web UI 提供精确缓存命中率、token 用量与费用估算
- [dsh-genui](https://github.com/omdsh-dev/dsh-genui) — 助手回复内渲染交互式 UI 组件：布局、图表、表单、测验、mermaid、3D 场景与回传事件循环。
- [dsh-git-graph](https://github.com/1841220388zzzcccxxx-star/dsh-git-graph) — Embedded git repository graph visualizer for the DeepSeek Harness Web GUI | 嵌入式 Git 仓库图谱可视化插件（提交历史图 / 分支过滤 / 文件 diff / VSCode 式未提交改动）
- [dsh-hud](https://github.com/a903067276-rgb/dsh-hud) — HUD 状态面板：Git 状态、MCP 服务器、技能列表、模型与 token 用量，悬浮侧栏一览无余。
- [dsh-IDE](https://github.com/chenw2759-wq/dsh-IDE) — dsh-IDE 把 DeepSeek Harness（DSH）网页版升级成一站式 IDE：JupyterLab 式文件树、带语法高亮的代码编辑、多格式预览、Trae 风格红绿 diff 和内置终端，再加上「本地大脑、远程手脚」的 SSH 远程工作区，让 AI 直接在本机操控远程服务器，全程零配置文件改动。
- [dsh-input-plus](https://github.com/WhitePlusMS/dsh-input-plus) — 为网页输入区增加工作区文件引用、提示历史等轻量增强功能。
- [dsh-LAN](https://github.com/MrMu666/dsh-LAN) — 为DeepSeek harness开启局域网访问及移动端页面的插件，移动端界面适配
- [dsh-lan-access](https://github.com/TZHR-invest/dsh-plugins) — Web UI 完整局域网/远程访问：0.0.0.0 绑定、crypto.randomUUID polyfill、token 门禁（401 登录页 + WebSocket 拦截，环回地址豁免）、特权栅栏与设置持久化豁免，以及可幂等升级恢复的安装器。
- [dsh-latex-tools](https://github.com/liuup/dsh-latex-tools) — ♾️ Copy and export the LaTeX in DeepSeek Harness 悬停任意 LaTeX 公式即可复制 TeX 源码或导出为独立的 SVG 文件
- [dsh-market](https://github.com/2BingLing/dsh-market) — DeepSeek Harness 插件市场 · 持续收录 1500+ DSH 插件：中文搜索 + 实用五维评分 + 一键安装。Web 版与 DSH 侧边栏插件双形态。Plugin marketplace for DeepSeek Harness: 1500+ plugins, Chinese search, 5-dim scoring, one-click install.
- [dsh-mermaid](https://github.com/AKS1st/dsh-mermaid) — 在 DSH Web 会话中把 Mermaid 代码块渲染为 SVG 图表。
- [dsh-message-preview](https://github.com/asukasec/dsh-message-preview) — 右侧用户消息导航条，根据消息数量与可用高度自适应排布导航块，并支持悬停预览、键盘操作与点击跳转。
- [dsh-message-rail](https://github.com/wx-yss/dsh-message-rail) — Codex 风格左侧消息导航轨道：等距刻度 + 悬停预览 + 点击跳转用户消息 · DSH Web 插件
- [dsh-mic-input](https://github.com/QT-Chen/dsh-mic-input) — 输入框麦克风语音输入：浏览器 Web Speech API 实时转写，自动去重/续听、智能标点，支持语言与自动发送设置。
- [dsh-milestone](https://github.com/SnowCrescenter-tech/dsh-milestone) — 右侧圆点时间轴导航条，点击跳转到任意用户消息。
- [dsh-mindmap](https://github.com/chenw2759-wq/dsh-mindmap) — DSH 思维导图模式插件：课件(PPT/PDF/Word)+电子书 → 打印级复习思维导图 HTML（A3 横向、每主干一页、大括号式横向、黑体、4 种风格、右侧笔记区、封面总览 + 交互式测试题）。建议配合 dsh-IDE 插件预览生成的 HTML。
- [dsh-mini-tui](https://github.com/boxeryao/dsh-mini-tui) — 提供轻量快速的终端插件，直接连接 DSH 运行时。
- [dsh-mobile](https://github.com/lehhair/dsh-mobile) — 为 DeepSeek Harness 提供移动端界面，支持手机访问与交互。
- [dsh-mobile-ui](https://github.com/TZHR-invest/dsh-plugins) — 窄屏下的 Web GUI 移动版 UI：全宽响应式布局、浮层会话抽屉、44px 触控目标、安全区适配与阅读增强，不影响桌面端。
- [dsh-moyan](https://github.com/elviszhang007/dsh-moyan) — 简洁、克制、安静，旨在为您的Vibe Coding增加些许文艺感。每次打开WebUI，左下角都会出现一句话，从古诗词到文采句，再到脍炙人口的游戏台词，应有尽有。语料库可高度自定义，插件风格完全适配原生Harness界面，功能简洁明确，绝不喧宾夺主。
- [dsh-multi-folder](https://github.com/AngelosZou/dsh-multi-folder) — 在界面中支持多文件夹管理，可能用于整理文件或会话。
- [dsh-navbar](https://github.com/vlln/dsh-navbar) — 对话节点导航条，右缘节点串快速跳转 user 消息。
- [dsh-node-nav](https://github.com/Seryta/dsh-node-nav) — 对话节点导航：DSH Web GUI 右侧节点串，hover 预览、点击跳转、active 药丸跟随阅读位置
- [dsh-open-in-ide](https://github.com/LJninse/dsh-open-in-ide) — 在 Web 界面添加按钮，自动检测本地 IDE 并打开当前工作区文件夹。
- [dsh-opencode-go-quota](https://github.com/GLFzr/dsh-opencode-go-quota) — DSH 插件：OpenCode Go 额度圆环 —— 输入框模型选择器左侧的进度圆环，点击切换 5小时/每周/每月用量（OpenCode Go quota ring for DeepSeek Harness Web）
- [dsh-opencode-go-usage](https://github.com/v587d/dsh-opencode-go-usage) — 在输入框上方 dock 显示 OpenCode Go 订阅用量（5h 滚动/每周/每月窗口与重置倒计时），内置凭据编辑器。
- [dsh-opencodego-usage](https://github.com/BeiZi6/dsh-opencodego-usage) — 通过呼吸灯和玻璃面板显示 OpenCodeGo 配额用量，含滚动、周和月进度条。
- [dsh-openpencil](https://github.com/ZSeven-W/dsh-openpencil) — OpenPencil 设计预览与编辑插件。
- [dsh-outline](https://github.com/urzeye/dsh-outline) — DeepSeek Harness（DSH）Web GUI 的实时大纲插件
- [dsh-output-styles](https://github.com/PerryLink/dsh-output-styles) — 通过命令实现会话级、持久且可切换的模型输出风格。
- [dsh-pet](https://github.com/zealot00/dsh-pet) — DSH Web UI 桌面宠物：精灵图动画、agent 状态联动、拖拽、闹钟（每天/一次）与番茄钟，皮肤下拉选择 + 预览。
- [dsh-pi-tui](https://github.com/XMoon/dsh-pi-tui) — 为 DeepSeek Harness 提供第三方终端用户界面。
- [DSH-Plan-Graph](https://github.com/HR2AY/DSH-Plan-Graph) — 将代理执行轨迹可视化为计划图，提供 DIY 视角来查看工作流。
- [dsh-plugin-background](https://github.com/gameswu/dsh-plugin-background) — dsh壁纸插件
- [dsh-plugin-better-sidebar-plugin-office](https://github.com/HuanLinOTO/dsh-plugin-better-sidebar-plugin-office) — 为 better-sidebar 插件添加 Office 文档预览，作为独立包分发。
- [dsh-plugin-deepseek-balance](https://github.com/fishxcode/dsh-plugin-deepseek-balance) — 在 DSH Web 设置中展示 DeepSeek API 余额、余额趋势与每日用量图表。
- [dsh-plugin-hub](https://github.com/Noob-stupid/dsh-plugin-hub) — 插件管理面板：已安装插件一键启用/停用，内置 GitHub dsh-plugin 插件市场，支持详情查看与一键安装。
- [dsh-plugin-hub](https://github.com/yunhuantian/dsh-plugin-hub) — 在网页界面提供图形化应用商店，可浏览、搜索和安装带评分与审计的 GitHub 插件。
- [dsh-plugin-marketplace](https://github.com/AwesomeHou/dsh-plugin-marketplace) — 将 GitHub dsh-plugin 主题同步为可搜索、分页的插件市场，支持一键安装。
- [dsh-plugin-marketplace](https://github.com/YELEBAI/dsh-plugin-marketplace) — 作为经过验证的插件市场和自主注册表，用于发现 DSH 插件。
- [dsh-plugin-msg-nav](https://github.com/SherUnlocked-4869/dsh-plugin-msg-nav) — DeepSeek Harness 对话节点导航条插件：在对话区右缘渲染一列短横线节点串（每条真实用户消息一个节点），跟随阅读位置；鼠标靠近节点串时，节点条「变形弹出」为单行消息预览面板（覆盖原位置，移开复原），点击任意预览平滑跳转 + 高亮横线，节点过多时可在悬停区域内用滚轮滑动浏览
- [dsh-plugin-setting-mcp](https://github.com/Ceelog/dsh-plugins) — 在 Web 设置面板管理 MCP 服务器：查看、新增、编辑、删除、启用或停用，保存后热重载。
- [dsh-plugin-smooth-stream](https://github.com/SpookySandwich/dsh-plugin-smooth-stream) — 改善流式文本动画，带来更平滑的视觉体验。
- [dsh-plugin-tts](https://github.com/1624318455/dsh-plugin-tts) — 使用 Edge TTS 朗读助手回复，支持自动朗读开关和语音设置面板。
- [dsh-plugin-vscode-sidebar](https://github.com/gameswu/dsh-plugin-vscode-sidebar) — 提供vscode风格和功能的侧栏
- [dsh-plugin-workbench](https://github.com/Pasumao/dsh-plugin-workbench) — 在DSH网页界面添加可编辑预览的工作区文件浏览器。
- [dsh-plugin-workshop](https://github.com/yyyyukari/dsh-plugin-workshop) — 为 DSH 网页界面提供类似 Steam 创意工坊的插件浏览器，支持搜索、趋势与一键管理。
- [dsh-plugin-ya-workspace-sidebar](https://github.com/HuanLinOTO/dsh-plugin-ya-workspace-sidebar) — 用最近会话、二级菜单和面包屑替代工作区侧栏。
- [DSH-Plugins-Marketplace](https://github.com/bradeGithub/DSH-Plugins-Marketplace) — 在DeepSeek Harness Web界面中浏览、安装和更新所有GitHub dsh-plugin插件。
- [dsh-plugins-store](https://github.com/ZASENJC/dsh-plugins-store) — 自动分类、收录和验证DeepSeek Harness社区插件的市场，提供流畅的发现体验。
- [dsh-plugins-store](https://github.com/ZASENJC/dsh-plugins-store) — 自动分类、收录和验证DeepSeek Harness社区插件的市场，提供流畅的发现体验。
- [dsh-popout-sidebar](https://github.com/e2mcc/dsh-popout-sidebar) — 支持将侧边栏弹出主窗口，独立悬浮显示以方便操作。
- [dsh-queue-plus](https://github.com/starslittle/dsh-queue-plus) — DSH 排队消息增强面板：编辑、删除、插话、排序与批量删除功能
- [dsh-ramify](https://github.com/yanglongyun/dsh-ramify) — Ramify 是 DeepSeek Harness 的创意分支画布插件，用树状工作区生成、对比和迭代多个可交互方案。
- [dsh-reasoning-effort](https://github.com/HanaAyane/dsh-reasoning-effort) — DSH适用的Codex风格的思考强度滑块，以及大肥鱼跑步滑块。Codex-style model and reasoning-effort slider for DeepSeek Harness
- [dsh-reasoning-effort-hdbzq](https://github.com/flyemFSB/dsh-reasoning-effort-hdbzq) — 滑动变祖器
- [dsh-side-chat](https://github.com/2031814001yuyue-tech/dsh-side-chat) — 提供侧边聊天界面，便于工作同时进行对话。
- [dsh-side-chat](https://github.com/AHGGG/dsh-side-chat) — 提供侧边聊天面板，让用户在不打断主对话的情况下追问。
- [dsh-side-panel](https://github.com/ccq1/dsh-side-panel) — 侧边栏集成文件浏览器、终端和 Git 审查，方便预览文件。
- [dsh-sidebar-mode](https://github.com/Meredith2328/dsh-sidebar-mode) — 把默认的四种模式切换塞进「新会话」按钮里，新会话创建更方便（标准/PTC/创造/极简，与设置双向同步）
- [dsh-sidebar-qa](https://github.com/ChenRuoT/dsh-sidebar-qa) — 一个基于DSH-better-sidebar的侧边栏提问tab，实现类codex的侧边提问或claude code的/btw功能
- [dsh-skill-viewer](https://github.com/Fishquito7/dsh-skill-viewer) — 在 DSH 网页界面增加技能管理区，支持热启停、删除和新增技能。
- [dsh-smooth-stream](https://github.com/Laplace-bit/dsh-smooth-stream) — 为聊天界面添加无闪烁的丝滑流式文本展示。
- [dsh-snapshot](https://github.com/DfsyJian/dsh-snapshot) — 自动保存文件快照，在侧边栏时间线中展示，并提供设置卡片便于浏览和管理。
- [dsh-spend](https://github.com/nonewind/dsh-spend) — DSH Web 用量与费用统计插件：右下角悬浮窗，按模型/按天/按会话多维聚合与预计花费。
- [dsh-split-panes](https://github.com/lehhair/dsh-split-panes) — 为 DeepSeek Harness 界面提供分栏布局，改善多任务处理。
- [dsh-spotlight](https://github.com/0xsline/dsh-spotlight) — 键盘优先的命令面板（command palette）。
- [dsh-stats-dashboard](https://github.com/1HelloMan1/dsh-stats-dashboard) — 展示模型用量仪表盘，含速度、日志、Token、缓存率、费用与导出。
- [dsh-status-rotator](https://github.com/01Virex/dsh-status-rotator) — 用阶段感知的打字机动画彩虹渐变色短语替换状态标签，支持JSON配置。
- [dsh-sticky-disclosure](https://github.com/Han-1413141/dsh-sticky-disclosure) — 一键收起会话中所有展开的区块（Think、工具卡等），常驻计数按钮 + 自定义快捷键。
- [dsh-sticky-note](https://github.com/Meredith2328/dsh-sticky-note) — 编辑框工具栏便签，随手记点子和 TODO，自动保存为 Markdown，一键发送到对话。
- [dsh-subagent-monitor](https://github.com/Mombrane/dsh-subagent-monitor) — 提供子代理监控面板，实时显示代理活动和状态，增强操作可见性。
- [dsh-suggested-replies](https://github.com/Anionex/dsh-suggested-replies) — DSH Web 预测回复插件：AI 回复后在输入框上方生成可点击填入草稿的下一步消息候选
- [dsh-sysmon](https://github.com/AKS1st/dsh-sysmon) — 在界面显示实时 CPU、内存和磁盘占用率的悬浮窗，监控系统状态。
- [dsh-task-dag](https://github.com/LeemanCheung/dsh-task-dag) — 将会话子代理与持久工作流运行展示为实时 DAG，支持状态展示、节点导航与重启后历史恢复。
- [dsh-task-status](https://github.com/vlln/dsh-task-status) — 后台任务状态条：对话页任务进度 + 实时输出 tail。
- [dsh-thinking-status-customizer](https://github.com/Dbi-Eshuh/dsh-thinking-status-customizer) — 自定义 DSH Web 思考状态，支持文字、动图或图文组合。
- [dsh-tianshu-tui](https://github.com/huiliyi37/dsh-tianshu-tui) — DeepSeek Harness 的终端 UI（TUI）。
- [dsh-timeline](https://github.com/zhangzheng25/dsh-timeline) — DSH 插件：极简提问时间线——每条提问一个圆点，点击跳转，悬停预览。Minimal question timeline for DeepSeek Harness.
- [dsh-token-cost](https://github.com/le-soleil-se-couche/dsh-token-cost) — 在对话页面直接查看消耗费用（嵌入官方底部状态条，点击看明细）；在设置中查看 Harness 消耗的总费用、缓存命中和输入输出
- [dsh-token-panel](https://github.com/juhe291/dsh-token-panel) — A corner HUD for DeepSeek Harness that shows your session's token pressure, per-model cost, and daily/monthly usage at a glance, with an editable budget and balance that tracks spending for you. 右下角常驻的 Token 仪表盘：实时看会话压力、按模型估算花费。预算和余额点一下就能改，每天每月用了多少都有记录。
- [dsh-token-usage](https://github.com/LaoYueHanNi/dsh-token-usage) — 按请求持久化模型 token 用量，Web 设置「Token 用量」统计页：按日趋势图、按模型明细表、日期/模型筛选。
- [dsh-tui](https://github.com/dsh-tui/dsh-tui) — 为 DeepSeek Harness 代理提供 Claude Code 风格终端界面，作为可安装插件包。
- [dsh-tui](https://github.com/tomowang/dsh-tui) — 为 DeepSeek Harness 提供开源终端前端，支持命令行操作。
- [dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI) — Claude Code 风格全屏终端 UI：像素鲸鱼顶栏、实时工作状态行、思考流式展开。
- [dsh-tui-plugin-OhMyPi](https://github.com/mytianyi0712/dsh-tui-plugin-OhMyPi) — 一个dsh的终端样式插件，灵感来自Oh My Pi
- [dsh-turn-navigator](https://github.com/vibeinging/dsh-turn-navigator) — 对话轮次导航。
- [dsh-ui-preset-enhance](https://github.com/lssyd20070106/dsh-ui-preset-enhance) — 增强 WebUI，支持自定义背景、主题色、提示词预设与手动压缩。
- [dsh-ui-quote-selection](https://github.com/nekogpt/dsh-ui-quote-selection) — 选中聊天文本即可作为引用芯片插入输入框，提升网页界面交互体验。
- [dsh-ui-web](https://github.com/CAPTAIN1275/dsh-ui-web) — 为客户端界面添加 AionUI 风格面板，增强视觉与交互组件。
- [dsh-usage](https://github.com/Aisland-SJL/dsh-usage) — 显示常驻停靠栏与可定制的余额/用量面板，含活动热力图与双通道对比。
- [dsh-usage-chart](https://github.com/Max-Samson/dsh-usage-chart) — 在界面中实时展示令牌用量、费用估算、每轮图表与余额。
- [dsh-usage-dashboard](https://github.com/Cassius0924/dsh-usage-dashboard) — DeepSeek 额度与用量仪表盘 — DSH (DeepSeek Harness) 动态 Cordis 插件
- [dsh-usage-meter](https://github.com/cute-baobao/dsh-usage-meter) — 记录各模型每小时 Token 用量，并在网页界面以堆叠柱状图展示。
- [dsh-usage-stats](https://github.com/Make0209/dsh-usage-stats) — DeepSeek Harness 插件：GitHub 风格用量热力图 + Token / 缓存命中 / 账户余额看板 + 工作区别名管理。
- [dsh-ux](https://github.com/jiangnanquan/dsh-ux) — Solarized 浅色主题、紧凑布局、思考/工具链折叠胶囊，以及余额、本轮成本与用量看板的 DSH Web 界面增强插件。
- [dsh-visualize](https://github.com/Nagi-ovo/dsh-visualize) — 对话内生成式 UI：模型把交互式 HTML 卡片直接画进会话流，带流式预览与沙箱渲染。
- [dsh-voice-input-plugin](https://github.com/Zhangbo-cn/dsh-voice-input-plugin) — 增加语音输入和实时转录，并支持流式语音朗读回复。
- [dsh-web-archive](https://github.com/renat3u/dsh-web-archive) — 折叠对话中的 Think、Bash 等「无用消息」。
- [dsh-web-attention-badge](https://github.com/Luaphes/dsh-web-attention-badge) — 会话需要你时三处同时亮起：角标、标签页标题计数、按状态换色的鲸鱼 favicon。
- [dsh-web-mobile](https://github.com/mexiaosqwq/dsh-web-mobile) — DeepSeek Harness Web UI 移动端适配插件:窄屏下侧边栏变为 overlay 抽屉,会话独占全宽。
- [dsh-web-mobile-fix](https://github.com/AcidGr/dsh-web-mobile-fix) — 针对 DSH Web 界面提供移动端适配修复。
- [dsh-web-plugin-manager](https://github.com/LX2000WASD/dsh-web-plugin-manager) — 在 Web UI 中一键管理 DeepSeek Harness (DSH) 插件：查看、实时启停、安装/卸载、更新检测、健康检查（依赖/冲突/兼容性分析）、环境管理、插件市场。bundle 与非 bundle 插件全覆盖
- [dsh-web-ui](https://github.com/zhu1090093659/dsh-web-ui) — 为 DeepSeek Harness 网页界面增加任务看板、Git 图、右侧面板、远程移动端界面、宠物、实时 token 统计和皮肤中心等功能。
- [dsh-web-ui](https://github.com/zhu1090093659/dsh-web-ui) — DSH Web UI 插件与皮肤合集：任务看板、git 图、右侧面板、远程移动端 UI、桌宠、实时 token 统计与皮肤中心。
- [dsh-webchatlike](https://github.com/cindyguyuehu123/dsh-webchatlike) — 添加网页版聊天风格的消息操作，支持编辑、重新生成及版本翻页，还原 DeepSeek 网页体验。
- [dsh-whale-animation](https://github.com/LeemanCheung/dsh-whale-animation) — DSH Web 状态文字旁的持久化黑色鲸鱼深潜动画，提供减少动态效果回退与无缝闭环。
- [dsh-window](https://github.com/ZichengGurrr/dsh-window) — DSH 原生 Windows 桌面窗口（WebView2）：一条命令安装，自动从 GitHub Releases 拉取应用包，创建桌面快捷方式，并提供 desktop_launch 工具在会话内启动。
- [dsh-window-kit](https://github.com/ZichengGurrr/dsh-window) — DSH 一体化套件：原生 Windows 桌面窗口（WebView2）、DeepEye 视觉（GLM-4V-Flash）与语音输入（麦克风按钮），一次安装全部可用。
- [dsh-wordbox](https://github.com/arcmosin/dsh-wordbox) — DSH Web GUI常用词箱子，方便项目常用词的存储和粘贴 | DSH Web GUI Common Words Box – for storing and pasting frequently used project terms."
- [dsh-workspace-explorer](https://github.com/3911ee/dsh-workspace-explorer) — VS Code 风格双栏资源管理器。左侧多工作区文件树：语言着色 SVG 图标、行内重命名、新建文件/文件夹；右侧编辑器可拖拽缩放，行号 + 状态栏，语法高亮（函数/关键字/注释/字符串分色，支持 10 种语言）
- [dsh-workspace-search](https://github.com/tsonglew/dsh-workspace-search) — VS Code 式工作区关键词搜索 Tab（better-sidebar 扩展）：同时匹配文件名与文件内容，结果按文件分组带行号，点击在侧栏编辑器打开。
- [ex-setting](https://github.com/omdsh-dev/ex-setting) — DSH 的设置扩展。
- [gal-view](https://github.com/Ayase34/gal-view) — 把dsh会话界面切换成galgame游戏界面的插件
- [ikanban](https://github.com/isomoes/ikanban) — 为 DeepSeek Harness 提供 iKanban 风格的看板界面，用于任务可视化。
- [long-draft-input](https://github.com/Heyflyingpig/long-draft-input) — Deepseek Harness 插件：用于聚合发送框长文本
- [model-usage-plugin](https://github.com/AKS1st/model-usage-plugin) — 统计各模型 tokens 消耗并估算费用，显示账户余额 | Model token usage stats and cost estimation with account balance for DSH
- [open-design](https://github.com/nexu-io/open-design) — 将 DeepSeek Harness 变成本地优先的设计引擎，可生成原型、落地页、仪表盘、幻灯片、图片和视频，并导出为 HTML、PDF、PPTX、MP4 等格式。
- [orbis](https://github.com/icodesign/orbis) — 移动端远程控制客户端，让用户通过手机管理DeepSeek Harness实例。
- [turn-scrubber](https://github.com/wsxwj123/dsh-plugins) — 右侧紧凑对话轮次导航条：悬停显示摘要，点击跳转对应轮次。
- [turtle-ui](https://github.com/turtle1999/turtle-ui) — 增强 DeepSeek Harness 的终端界面布局与交互体验。
- [Tydora](https://github.com/zuorn/Tydora) — 提供现代桌面 Markdown 编辑器，支持所见即所得、双向链接、思维导图和无限画布。
- [ui-status-label](https://github.com/alingalingling/ui-status-label) — 把鲸鱼娘思考时的 "deep diving" 状态文案自定义成任意你想要的样子。
- [web-components](https://github.com/omdsh-dev/web-components) — Web Components 支持。
- [widget-dock](https://github.com/MorGogh/widget-dock) — 对话两侧空白区的可拖动卡片工作台：余额、Token 用量、会话统计、目标、成本估算等小组件，支持 S/M/L/XL 尺寸档位与官方定价成本估算。
- [zat-dsh-engine](https://github.com/mishibeikejie/zat-dsh-engine) — DeepSeek Harness可视化插件市场，可浏览、搜索和安装社区插件。

</details>

<a id="theme"></a>

<details>
<summary><strong>主题与外观</strong> · 34 个插件</summary>

- [Catppuccin-dsh-theme](https://github.com/zhijun-dai/Catppuccin-dsh-theme) — 为 DeepSeek Harness 应用柔和淡雅的 Catppuccin 配色方案。
- [dafy-whale-theme](https://github.com/DViridescent/dafy-whale-theme) — DeepSeek Harness 蓝色大肥鱼主题插件：海洋配色、鱼群、气泡、吉祥物与品牌替换
- [deepseek-harness-themes](https://github.com/orxz/deepseek-harness-themes) — 提供 DSH 的 UI 主题集合，改变界面外观。
- [dsh-any-background](https://github.com/Tkingxiao/dsh-any-background) — 一个自定义主题插件，包括背景图（大小和位置），主界面和设置界面（透明度，色轮全色主题色）插件
- [dsh-black-whale](https://github.com/147228/dsh-black-whale) — DeepSeek Harness 黑鲸实验室主题：官网黑鲸 × 夕小瑶 IP，真实 profile 可安装的 Web UI 插件
- [dsh-blue-whale](https://github.com/starslittle/dsh-blue-whale) — 复刻 DeepSeek Chat 蓝鲸配色的皮肤，亮色/深色跟随系统外观。
- [dsh-catppuccin-theme](https://github.com/NoNameLeGo/dsh-catppuccin-theme) — DeepSeek Harness Web GUI 的 Catppuccin 主题插件：Latte / Frappé / Macchiato / Mocha 四种主题一键切换，内置可开关的玻璃质感（Glassmorphism）
- [dsh-client-ui-skin-claude](https://github.com/PAKIKNOWLEDGE/dsh-client-ui-skin-claude) — 提供 Claude 风格皮肤，包含暖黑背景、黏土色调和衬线界面。
- [dsh-custom-workspace](https://github.com/JeremyGuo/dsh-custom-workspace) — 为 DeepSeek Harness Web 提供按工作区的外观设置。
- [dsh-deep-whale](https://github.com/Small-tailqwq/dsh-deep-whale) — DSH Web 鲸鱼娘皮肤系列(深海女仆工坊 maid-atelier)——CC BY-NC-SA 4.0
- [dsh-deep-whale](https://github.com/Small-tailqwq/dsh-deep-whale) — DSH Web 鲸鱼娘皮肤系列（深海女仆工坊 maid-atelier）。
- [dsh-deepcel](https://github.com/Small-tailqwq/dsh-deepcel) — 一款模仿 excel 的 dsh 皮肤
- [dsh-dream-skin](https://github.com/RevolutionLA/dsh-dream-skin) — DeepSeek Harness 换肤 / 壁纸 / 主题包插件 (dsh-plugin) — 8 套 Mirage 主题、每用户强调色、壁纸2.0、主题包导入导出/分享链接、收藏与随机，纯原生 token 系统实现。
- [dsh-gui-customization](https://github.com/LAN-TINA-WS/dsh-gui-customization) — DeepSeek Harness 时装工坊：给 DSH 界面换装——更改主题配色/自定义背景图/自定义视频背景/可调节氛围灯，中英双语 ·DSH Web UI 时装工坊。
- [dsh-liang-skin](https://github.com/kingOfSoySauce/dsh-liang-skin) — DeepSeek Harness 滑动变阻器皮肤
- [dsh-liquid-glass](https://github.com/xingyingyuzhui/dsh-liquid-glass) — 为 DSH Web 界面添加壁纸和液态玻璃覆盖效果。
- [dsh-maid-whale-webUI](https://github.com/yunxiiQwQ/dsh-maid-whale-webUI) — DeepSeek Harness Web UI 鲸鱼女仆主题插件
- [dsh-outdoor-theme](https://github.com/Estellalee/dsh-outdoor-theme) — DSH 户外皮肤 · 山野向导（Trail Guide）
- [dsh-qq2006](https://github.com/LaplaceYoung/dsh-qq2006) — DSH (DeepSeek Harness) 的 QQ2006 皮肤插件：注册 qq2006 主题、镜像 body[data-ds-skin]、全局皮肤表与完整素材
- [dsh-skin](https://github.com/KinGao294/dsh-skin) — Codex 风格皮肤切换器 + 自定义壁纸层，可调透明度与模糊。
- [dsh-skin-appearance](https://github.com/Vim0x3c/dsh-skin-appearance) — DeepSeek Harness 外观定制插件：八套内置主题 + 自定义壁纸（透明度/模糊），Host 设置持久化 | Appearance plugin for dsh web
- [dsh-skin-switcher](https://github.com/zhtx2024/dsh-skin-switcher) — DeepSeek Harness Web GUI 皮肤切换插件：设置界面一键切换已安装皮肤
- [dsh-skins](https://github.com/Moeblack/dsh-skins) — 提供 dsh-external/dsh-skins 镜像及夕港黄昏皮肤。
- [dsh-stylevault](https://github.com/GptsApp/dsh-stylevault) — StyleVault 主题系统：30 套忠实经典配色（Catppuccin、Nord、Tokyo Night、Gruvbox、Solarized、Dracula、One Dark、Rosé Pine 等），映射官方 ThemeService token；完整 Style Settings 面板支持颜色/字体/圆角 live 微调，配置可导出/导入 JSON 分享。
- [dsh-theme-neko](https://github.com/drfccv/dsh-theme-neko) — 为 DeepSeek Harness 网页界面换上甘城猫猫主题皮肤。
- [dsh-theme-plugin](https://github.com/nevertoday/dsh-theme-plugin) — 为 DeepSeek Harness 提供中国传统文化配色主题包。
- [dsh-ui-appearance](https://github.com/TQSY114514/dsh-ui-appearance) — 定制外观，支持主题色板、背景图片、透明度、模糊和玻璃效果。
- [dsh-xiaoyao-skins](https://github.com/147228/dsh-xiaoyao-skins) — 夕小瑶 × DeepSeek Harness Web 皮肤合集、安装器与社区创作工具链
- [freestyle-dsh-theme](https://github.com/suzike/freestyle-dsh-theme) — DeepSeek Harness 主题体验插件：OKLCH 主题提案 + 主题设计器（跨重启持久化）
- [maid-whale-webui](https://github.com/yunxiiQwQ/dsh-maid-whale-webUI) — DSH Web UI 鲸鱼女仆纸质主题：浅色/深色配色、海洋插画、手绘边框、装饰素材与常驻桌宠。
- [seektty](https://github.com/Hilbert-beinghappy/seektty) — 为 DeepSeek Harness 提供可插拔的 DeepSeek 配色终端皮肤。
- [skin-gallery](https://github.com/wsxwj123/dsh-plugins) — 9 套完整的 dsh-web-ui 皮肤复刻：支持自定义皮肤包导入、预览、应用、删除与恢复默认，并修复气泡与代码块可读性。
- [theme-gallery](https://github.com/wsxwj123/dsh-plugins) — 15 套精选主题族，外加纯 CSS 自定义主题：支持导入、预览、应用、删除与恢复默认，并跟随原生浅色/深色/跟随系统模式。
- [touhou-hakurei](https://github.com/xiake595/touhou-hakurei) — 灵梦（Reimu）·博丽神社（东方Project）美化版皮肤：神社昼夜实景背景、灵梦立绘、画框侧边栏与输入框、纸白透明界面 — DeepSeek Harness Web GUI skin

</details>

<a id="session"></a>

<details>
<summary><strong>会话与消息</strong> · 57 个插件</summary>

- [billion-context-dsh](https://github.com/Tyan66666/billion-context-dsh) — 由模型决定何时压缩对话，通过主动修剪与搜索工具管理上下文。
- [dsh-agent-message](https://github.com/GengDaPeng/dsh-agent-message) — 实现跨会话的代理间通信，支持离线投递、回执和会话导航。
- [dsh-agent-messaging](https://github.com/happyren/dsh-agent-messaging) — 记录跨会话验证声明并维护决策账本，避免多个 Agent 会话重复、矛盾或死锁。
- [dsh-archived-sessions](https://github.com/MuWinds/dsh-archived-sessions) — DeepSeek Harness 插件-归档会话管理，支持释放、清除归档会话
- [dsh-archived-sessions](https://github.com/Zephyr-vibe/dsh-archived-sessions) — 管理会话，支持归档、恢复、安全删除及打开记录文件夹。
- [dsh-attachments](https://github.com/CocoSgt/dsh-attachments) — 管理对话中的附件，可能支持文件的存储和检索。
- [dsh-balance](https://github.com/TwotwoPiggy/dsh-balance) — 实时追踪令牌用量并估算会话费用，支持动态峰谷定价。
- [dsh-better-archive](https://github.com/huahai0202/dsh-better-archive) — 在网页界面中添加面板，可查看并操作已归档会话。
- [dsh-bookmarks](https://github.com/penguin-oo/dsh-bookmarks) — 收藏助手回复并添加备注和标签，提供跨会话中心和 Markdown 导出功能。
- [dsh-btw](https://github.com/iyllyt/dsh-btw) — 个人很喜欢 Claude Code 的 /btw，于是为 DSH 做了复刻：共享当前上下文快速旁路提问，不中断主任务，也不写入主会话历史。
- [dsh-chat-import](https://github.com/Nwflower/dsh-chat-import) — 把 Claude Code / Codex / ChatGPT / Cursor / Gemini / Reasonix / opencode 的聊天记录全保真导入为可续聊的 DSH 会话。
- [dsh-chatgpt-bridge](https://github.com/jiezeng2004-design/dsh-chatgpt-bridge) — 作为 MCP 桥接，让 ChatGPT 能创建、查看、继续和控制 DeepSeek Harness 会话。
- [dsh-checkpoint-rewind](https://github.com/PerryLink/dsh-checkpoint-rewind) — 提供基于Git的工作区快照、会话分支和一步回滚恢复。
- [dsh-claude-move](https://github.com/PerryLink/dsh-claude-move) — 将 Claude、Codex、OpenCode 等工具的会话、记忆、技能迁移到 DeepSeek Harness。
- [dsh-compaction-instant](https://github.com/KitDoesIt/dsh-compaction-instant) — 提供免 LLM 的无损对话压缩，减少 token 使用而不丢失内容。
- [dsh-composer-history](https://github.com/PerryLink/dsh-composer-history) — 为网页输入区提供终端风格的历史记录，支持方向键、Ctrl+R 反搜与工作区回放。
- [dsh-conversation-share](https://github.com/bill9109/dsh-conversation-share) — 分享任意段落的对话。
- [dsh-cot-summerization](https://github.com/MeowLynxSea/dsh-cot-summerization) — 可能用于会话中思维链的总结，具体功能待确认。
- [dsh-crosstalk](https://github.com/Jesse-njx/dsh-crosstalk) — 跨会话消息：本机任意会话都可像 Claude Code 一样列出并互发消息，基于本地心跳注册表与收件箱。
- [dsh-cue-plugin](https://github.com/unnnnoooo/dsh-cue-plugin) — DeepSeek Harness 的跨会话引用(cue)插件
- [dsh-explain](https://github.com/yuezengwu/dsh-explain) — 本地优先学习模式：跨会话全局学习线程、按来源讲解。
- [dsh-file-claim](https://github.com/Nwflower/dsh-file-claim) — 同一工作区并行多会话的文件认领与写入保护（claim/release、心跳 stale 接管、pending 三路合并）。
- [dsh-global-rules](https://github.com/badai147/dsh-global-rules) — 在 DeepSeek Harness Web 设置面板中编辑 ~/.dsh/AGENTS.md 全局规则的插件
- [dsh-inline-images](https://github.com/3403473060/dsh-inline-images) — 对话内联图片：LLM 回复中输出的本地图片路径在消息正文直接渲染为图片（9 种格式、点击放大灯箱、可调尺寸）。
- [dsh-interconnect](https://github.com/Chinesezjc/dsh-interconnect) — 跨实例互联：经 interconnect 服务在多个 DSH 实例间转发消息与事件。
- [dsh-lineage](https://github.com/dongsheng123132/dsh-lineage) — 跟踪产物、事实、操作和报告的跨会话内容寻址血缘关系。
- [dsh-md-notes](https://github.com/XieZongChen/dsh-md-notes) — 提供 Markdown 笔记管理和编辑器，快速记录对话内容并同步到 Git。
- [dsh-message-edit](https://github.com/Moeblack/dsh-message-edit) — 基于分支的消息编辑、reroll、重试与版本时间线。
- [dsh-peer-link](https://github.com/czm15053/dsh-peer-link) — 让 dsh 和 Claude Code 会话直接互发消息，附带可点击的会话列表卡片（搜索/刷新/弹窗发送）。
- [dsh-plugin-session-delete](https://github.com/lsz-asd/dsh-plugin-session-delete) — 从界面删除会话，含危险按钮、确认对话框和原地刷新。
- [dsh-plugin-session-import](https://github.com/huguangyu666/dsh-plugin-session-import) — 导入 Claude Code、Codex 等工具的会话记录到 DSH。
- [dsh-prompt-persona](https://github.com/Xilin3/dsh-prompt-persona) — 在设置页直接编辑系统提示或部署人设，并支持实时预览。
- [dsh-prompt-stash](https://github.com/Wine-Red/dsh-prompt-stash) — 本地、按会话隔离的 LIFO 输入暂存：临时收起未完成的输入，之后安全恢复并继续编辑。
- [dsh-prompt-studio](https://github.com/Moeblack/dsh-prompt-studio) — 带实时预览的用户/内置 system prompt 分节编辑器。
- [dsh-recall](https://github.com/Mongfayi/dsh-recall) — 为每条用户消息添加撤销按钮，可持久删除该轮及之后内容。
- [dsh-recall-plugin](https://github.com/limbo947/dsh-recall-plugin) — DSH 消息撤回插件：回到发送该消息时的状态 DSH Message Recall Plugin: Return to the state when the message was sent
- [dsh-Remote](https://github.com/Blank-not-black/dsh-Remote) — DSH Remote · 口袋里的 DSH 控制台 会话 · 审批 · 提问 · 文件传输，局域网 / Tailscale 直连 多服务器自动选优，聊天记录离线可看 带 Token 鉴权，数据只在你的设备之间流动 Sessions · approvals · questions · file transfer over LAN / Tailscale. Automatic fastest-server selection. Chat history available offline. Token-authenticated — your data flows only between your devices.
- [dsh-session-cleaner](https://github.com/fountunt/dsh-session-cleaner) — 为 DeepSeek Harness 提供会话删除能力，支持侧边栏 ⋮ 菜单入口
- [dsh-session-deeplink](https://github.com/R3alloc/dsh-session-deeplink) — 生成可分享的会话深链接，方便快速访问特定会话。
- [dsh-session-export](https://github.com/bwndlct/dsh-session-export) — 把当前会话导出为可移植、带 schema 版本的 Markdown 与 JSON 文件，提供 `session_export` 工具与斜杠命令两种入口，文件名跨平台安全。
- [dsh-session-hub](https://github.com/Asaiuta/dsh-session-hub) — 聚合多台远程 DSH 服务器的会话，并通过中心网关与官方 UI 原生操控。
- [dsh-session-management](https://github.com/cokiscarazo-rgb/dsh-session-management) — 管理会话，可能提供历史记录、切换或持久化功能。
- [dsh-session-manager](https://github.com/dream12347/dsh-session-manager) — DSH 会话管理插件：删除（回收站恢复/彻底清除）、统计、继续/暂停、打开日志目录、对话顶部抽屉、工作区分组与排序、上下文压缩阈值设置。DSH session manager: delete with trash/restore/purge, stats, continue/pause, log folder, header drawer, workspace grouping, context compaction threshold.
- [dsh-session-manager](https://github.com/Vim0x3c/dsh-session-manager) — DeepSeek Harness 会话管理设置面板：列出本机全部会话（运行中/空闲/已归档），支持继续会话、预览大纲、删除会话 | Session management settings section for dsh web: resume, outline, and delete any session
- [dsh-session-manager](https://github.com/wsxwj123/dsh-plugins) — DSH Web GUI 会话管理：删除支持 5 秒撤销与回收站，归档视图可浏览与取消归档。
- [dsh-share](https://github.com/hellodigua/dsh-share) — 一键分享你的对话。
- [dsh-side-chat](https://github.com/heartmove/dsh-side-chat) — 选中对话片段，在右侧面板的侧边聊天中提问（按会话隔离）；AI 回复可原文或摘要后带回主会话。
- [dsh-sidechain](https://github.com/omdsh-dev/dsh-sidechain) — `/side` 持续性侧会话与 `/btw` 一次性侧问，在临时 fork 中运行、不写入主会话历史。
- [dsh-solo-thinking](https://github.com/fredalxin/dsh-solo-thinking) — 为DSH添加独立的头脑风暴分支和交接机制，支持专注的并行思考。
- [dsh-stream-rules](https://github.com/jiesou/dsh-stream-rules) — 根据模式匹配注入引导规则，指导对话且不占用上下文。
- [dsh-token-usage](https://github.com/LeemanCheung/dsh-token-usage) — 持久化记录每个会话的 Token 用量，在设置页提供 provider/model 统计与最近 52 周活跃度热力图。
- [dsh-turn-rewind](https://github.com/Anionex/dsh-turn-rewind) — 对话回退：基于持久 Change Ledger 回滚会话与工作区状态。
- [dsh-undo](https://github.com/LingLambda/dsh-undo) — 回滚模型上下文至上一步完成状态并可恢复。
- [dsh-whale-report](https://github.com/SenmuuuuW/dsh-whale-report) — 深迹 DeepTrace — Your Agent, in numbers. DSH 插件：从会话事件日志生成日报/周报/月报/年报/自定义区间，确定性洞察与协作复盘，只读、不改写历史。
- [plugin-session-export](https://github.com/whyihaveyou/dsh-suite) — 将只追加的会话日志导出为可读的 Markdown 或 HTML，按轨迹来源分组。
- [session-persistence-rdb](https://github.com/morlay/session-persistence-rdb) — session 关系型数据库持久化
- [task-passport](https://github.com/dongsheng123132/task-passport) — 通过机器可读检查点与乐观锁，在 DeepSeek Harness、WorkBuddy、Claude Code 和 Codex 之间交接持久任务状态。

</details>

<a id="memory"></a>

<details>
<summary><strong>记忆</strong> · 39 个插件</summary>

- [Co-Engram](https://github.com/Co-Engram/Co-Engram) — 自进化团队记忆系统，跨会话存储和回忆共享知识以增强协作。
- [coding-agents](https://github.com/vectorize-io/hindsight) — Hindsight 可学习的 Agent 记忆：自动召回与沉淀的长期项目记忆、知识页、深度反思与按仓库隔离的记忆库。
- [distill](https://github.com/LoserFox/distill) — 自动对话蒸馏：后台 subagent 反省 + 技能 create/update。
- [dsh-auto-memory](https://github.com/Aik358/dsh-auto-memory) — 实现三层自动记忆系统，含主动日历提醒、温馨问候与跨工具记忆继承。
- [dsh-context](https://github.com/bowenliang123/dsh-context) — 为 DeepSeek Harness 网页界面添加上下文洞察面板，展示模型上下文窗口当前的构成与演变过程：各部分占比与窗口大小对照、按请求的历史趋势、压缩与注入事件，以及消息级 token 统计。
- [dsh-file-memory](https://github.com/ICCuse/dsh-file-memory) — 文件型工作记忆：memorize/recall 把关键前提逐字保存在会话笔记文件，无损挺过上下文压缩。
- [dsh-knowledge](https://github.com/ICCuse/dsh-knowledge) — 全局知识库桥：kb_add/kb_search/kb_show/kb_timeline 读写与 Codex 共享的 D:\knowledge（格式逐字节兼容）。
- [dsh-llm-wiki](https://github.com/detpecca/dsh-llm-wiki) — 将 DeepSeek Harness 接入 wiki，实现跨会话知识的存储与检索。
- [dsh-mem](https://github.com/Jelee0145/dsh-mem) — 为dsh构建持久化跨工作区记忆的插件
- [dsh-memento](https://github.com/PerryLink/dsh-memento) — 有界、分层、带审批门、可审计的跨会话记忆：`ctx.memory` 服务 + 零依赖 SQLite 存储 + `memory` 工具与冻结快照注入；写入必过审批门，模型可见内容可自会话日志重建。
- [dsh-memoir](https://github.com/Qinling-Melon-Farmers/dsh-memoir) — DSH 项目持久化记忆插件（TypeScript）：会话归纳 + 经验教训沉淀，写入 PROJECT_MEMORY.md 与全局索引；每轮工作结束自动提醒蒸馏、自动注入未来 AGENTS；附 Web GUI 记忆面板（项目/全局 tab、检索、手动记录/删除）。dsh-plugin
- [dsh-memory](https://github.com/FuRongJun-1999/dsh-memory) — AGI 的长期记忆基础设施。让 AI Agent 拥有不可遗忘的自我。跨会话记忆 · 持续学习 · 可审计信任（智能论 v3.2）
- [dsh-memory](https://github.com/Jesse-njx/dsh-memory) — 基于 DSH 无损会话日志的引用式记忆：蒸馏出的事实带 `(sessionId, eventRange)` 引用，可随时展开回原始日志片段。
- [dsh-memory-meow](https://github.com/Phant0Meow/dsh-memory-meow) — 项目级跨会话记忆：PROJECT.md 快照注入首条用户消息（缓存友好）+ memory_remember 工具 + ReAct 任务结束自动反思；各项目独立记忆文件，互不互通。
- [dsh-memory-system](https://github.com/zhujunpeng12/dsh-memory-system) — 提供本地优先的持久记忆，支持热启动、BM25 冷召回、事务写入和只读治理。
- [dsh-memory-vault](https://github.com/flymysql/dsh-memory) — 跨会话记忆库：remember / recall / forget 工具、每轮提示注入与设置页条目浏览。
- [dsh-mneme](https://github.com/modusensus/dsh-mneme) — 实现结构化记忆引擎，支持语义搜索、实体时间线和自动整合。
- [dsh-mneme](https://github.com/modusensus/dsh-mneme) — 跨会话记忆：SQLite + 可人工编辑的 Markdown 镜像，后台自动巩固（去重/合并/冲突裁决），提供 6 个记忆工具。
- [dsh-mnemon](https://github.com/omdsh-dev/dsh-mnemon) — Mnemon 深度集成：本地三层记忆（Runtime Memory、可检索 Documents、受监督 Memory Spaces）。
- [dsh-noema](https://github.com/ZSeven-W/dsh-noema) — 提供持久可检查的长期记忆，配备召回工具和设置页面，方便管理代理记忆。
- [dsh-personalize](https://github.com/Zephyr-vibe/dsh-personalize) — 支持每主机自定义指令、本地长期记忆与回复语气预设。
- [dsh-plugin-asmemory](https://github.com/Xplore-LAB/dsh-plugin-asmemory) — 动作-状态时序记忆：记录类型化的状态与动作，做趋势、异常与因果关联分析。
- [dsh-premise-guard](https://github.com/ICCuse/dsh-premise-guard) — 压缩后前提漂移守卫：摘要丢失关键字面锚点时注入一次性提醒。
- [dsh-tdai-memory](https://github.com/Scorp1o117/dsh-tdai-memory) — 为代理提供持久记忆，存储并回顾跨会话的信息。
- [dsh-tool-user-memory](https://github.com/IAMLieutenant/dsh-tool-user-memory) — DeepSeek Harness 用户记忆插件
- [eli-mode](https://github.com/CeilCelia/dsh-eli-mode) — 知识库驱动的 Agent 预设：wiki 长期记忆、Web 知识库界面、管理页面与可选的 UI 美化。
- [engramory](https://github.com/tinqiao-oss/engramory) — 为 AI 智能体定义可移植的记忆协议，作为常驻规则加载，包含管理纪律、参考规范和可选钩子。
- [forge-memory](https://github.com/jinguanghai/deepseek-harness-forge-plugins) — 基于 BM25 关键词检索的记忆召回。
- [gitlearnos](https://github.com/Guojiz/gitlearnos) — 提供基于 Git 的 AI 学习系统，包含定向练习、本地检索增强生成和学员自有记忆。
- [graph-memory](https://github.com/adoresever/graph-memory) — 从对话中提取结构化三元组构建知识图谱，压缩上下文 75%，支持跨会话经验复用。
- [Liltloom](https://github.com/Adkid-Zephyr/Liltloom) — 语织：中文优先、用户可控的 AI 写作风格记忆层，让 AI 学会你的表达，需要时再调用。Chinese-first style memory for AI; DeepSeek Harness adapter included.
- [MisakaNet](https://github.com/Ikalus1988/MisakaNet) — 为零依赖、Git 支持的微型课程库，供 AI 智能体异步分享和搜索经过验证的调试经验。
- [mnemon](https://github.com/mnemon-dev/mnemon) — 提供 LLM 监督的持久记忆，基于图召回和跨会话知识，以单一二进制支持多种智能体运行时。
- [nowledge-mem-deepseek-harness](https://github.com/nowledge-co/nowledge-mem-deepseek-harness) — 给所有 AI 工具和 Agent 共用的一层记忆：注入 Context Bundle、提示时检索、MCP 工具与回合结束 DSH 线程捕获。
- [OpenViking](https://github.com/volcengine/OpenViking) — 为 AI 智能体提供自我演进的上下文数据库，统一跨会话的记忆、知识检索（RAG）和技能。
- [powercontext-dsh](https://github.com/knqiufan/powercontext-dsh) — 通过HTTP连接PowerContext服务器，获取长期记忆、交接、经验和技能。
- [sage-mem](https://github.com/gezi-wen/sage-mem) — 为 DeepSeek Harness 实现长期记忆的存储与检索，可能基于向量搜索。
- [sgme](https://github.com/freehul/sgme) — 拾光记忆引擎（SGME）桥接：多智能体共享长期记忆（HTTP）—— L0/L1/L1.5/L2 分层提炼、按场景注入、统一检索、主动关怀信号（memory_search / wiki_search / signal_pull / signal_claim / signal_ack），npm 包名 `dsh-sgme`。
- [TMCRA-Agent-Memory](https://github.com/reshuibuduo/TMCRA-Agent-Memory) — 为 AI 代理实现基于图、作用域隔离的长期记忆引擎。

</details>

<a id="tools"></a>

<details>
<summary><strong>工具与能力</strong> · 210 个插件</summary>

- [@zhaoolee/dsh-notes](https://github.com/zhaoolee/notes) — 将 DSH 对话导出为锤子便签风格 PNG，或在配置的账号工作区中新建和更新 Markdown 便签。
- [agentrq](https://github.com/agentrq/agentrq) — 为 AI 智能体提供自托管的实时对话式任务管理器，支持人在环路，可从移动端、网页或桌面端控制。
- [anime-find](https://github.com/cocofhu/anime-find) — DeepSeek Harness 搜番插件：对话内多源搜索番剧，卡片展示 Bangumi 评分与详情，支持复制磁力。
- [anysearch-dsh](https://github.com/anysearch-team/anysearch-dsh) — 为DeepSeek Harness提供网络搜索和高级搜索工具，增强信息检索能力。
- [argo](https://github.com/taxueseek/argo) — 专为 agent 打造的搜索工具：多语言，覆盖中文/英文/学术/代码/购物/金融/新闻/百科。
- [blender](https://github.com/CheshireJCat/blender) — Blender 3D 生产插件：提供 30 个建模/重建 Skill、13 个运行时工具和 26 个确定性 Helper，覆盖参考图拟合、渲染、验证、动画与可移植格式导出；npm 包名 `dsh-blender`。
- [citeguard](https://github.com/Chhlafiu4312/citeguard) — 在 DeepSeek Harness 回复中提取引用并验证证据，帮助用户确认信息可靠性。
- [deepseek-harness-desktop-app](https://github.com/vibeinging/deepseek-harness-desktop-app) — 提供本地 AI 桌面工作空间，用于会话、项目、文件、网络研究、插件和 Office 文档。
- [deepseek-vision](https://github.com/GOU-GEE/deepseek-vision) — 可能为 harness 提供视觉分析能力。
- [deepseek-visionary](https://github.com/xlight/deepseek-visionary) — 为多个编码工具接入 DeepSeek 官方多模态视觉模型，让 Agent 具备识图能力。
- [dsh-adb](https://github.com/SamXiaBing/dsh-adb) — ADB 设备·台架运维工具集：设备发现、结构化 logcat（后台采集）、apk 安装、文件 pull/push、性能快照。
- [dsh-adhd-copilot](https://github.com/zimai233/dsh-adhd-copilot) — ADHD 行为辅导技能：任务拆解、事项过载管理、启动仪式与失败重启。
- [dsh-apple-mode](https://github.com/jihongboo/dsh-apple-mode) — DSH 的 Xcode AI 集成：26 个 Xcode MCP 工具（mcpbridge）+ Apple 平台技能 + Xcode Intelligence 风格 persona（agent preset 或全局 bundle）。
- [dsh-atomgit](https://github.com/xiongjiamu/dsh-atomgit) — 打包 AtomGit 技能、工作流、CLI 与 MCP 工具，支持仓库和平台集成。
- [dsh-auto](https://github.com/simon300000/dsh-auto) — 自动化 DeepSeek Harness 中的审批流程，减少日常任务的人工干预。
- [dsh-auto-approval](https://github.com/Andy8647/dsh-auto-approval) — 自动批准代理操作，简化工作流程。
- [dsh-auto-approve](https://github.com/Jiao-XXX/dsh-auto-approve) — 为 DeepSeek Harness 增加介于 Workspace Write 与 Full access 之间的自动批准权限档，危险或不确定操作仍转人工审批。An auto-approval permission preset between workspace-write and full access for DeepSeek Harness.
- [dsh-auto-mode](https://github.com/NanmiCoder/dsh-auto-mode) — 为DeepSeek Harness提供安全自动权限管理，在保持安全控制的同时允许自动化操作。
- [dsh-backup](https://github.com/xiaoyuyu6420/dsh-backup) — 一键备份 DSH 用户数据：/backup 命令、定时自动备份、sha256 校验与自动轮换。
- [dsh-bash-terminal](https://github.com/MAXeaglet/dsh-bash-terminal) — 一个 shell 工具：Windows 上统一执行 PowerShell / Git Bash / WSL，外加交互式 PTY 终端，默认终端由用户在设置中选择。
- [dsh-bash-win](https://github.com/zimzaza4/dsh-bash-win) — 在 Windows 环境中为 DeepSeek Harness 提供 Git Bash 与 WSL 2 bash 工具,含 bwrap 沙箱、审批模式、后台任务
- [dsh-better-browser](https://github.com/titanwings/dsh-better-browser) — DSH 真实浏览器插件：通过 Kimi WebBridge 让 Agent 操作用户已登录的浏览器，并提供 13 个 webbridge_* 工具。 / Let DSH Agents use your signed-in browser through thirteen Kimi WebBridge tools.
- [dsh-better-deepseek](https://github.com/EdgeTypE/dsh-better-deepseek) — 连接 DeepSeek Harness 与 Better DeepSeek 浏览器扩展，启用增强的聊天功能。
- [dsh-better-edit](https://github.com/Rianico/dsh-better-edit) — 提供基于哈希锚点的文件读取、编辑、批量编辑与撤销上次编辑工具。
- [dsh-bilibili](https://github.com/CZX2244/dsh-bilibili) — 集成 Bilibili 功能，可能支持用户搜索、获取或与 Bilibili 内容互动。
- [dsh-billing](https://github.com/TheTianzz/dsh-billing) — DeepSeek Harness plugin: 账户余额 + 会话费用（/balance /cost 命令、deepseek_billing 工具、Web UI 双胶囊），官方价格每 12 小时自动同步
- [dsh-browser](https://github.com/Lum1104/dsh-browser) — Chrome 侧边栏扩展，让 DSH 直接操控你的浏览器，无需视觉能力。
- [dsh-browser](https://github.com/wqty123/dsh-browser) — 为 DeepSeek Harness 提供共享的真实浏览器控制工具。
- [dsh-browser](https://github.com/xylt369/dsh-browser) — 提供基于 Playwright 的浏览器自动化，含安全导航、无障碍点击与受限评估。
- [dsh-browser-companion](https://github.com/Tianyu209/dsh-browser-companion) — 提供持久配置的浏览器，带可见窗口、人工登录与安全的代理浏览工具。
- [dsh-browser-playwright](https://github.com/ChenyuHeee/dsh-browser-playwright) — 通过 Playwright 实现浏览器自动化，基于无障碍树交互、稳定引用和会话级上下文，提供 17 个浏览器工具。
- [dsh-clawrouter](https://github.com/BlockRunAI/dsh-clawrouter) — 增加安全门禁，由更强模型审查危险工具调用，并支持视觉和67种模型共享钱包。
- [dsh-code-intel](https://github.com/lonelymoon87/dsh-code-intel) — 用 Tree-sitter 建立工作区符号索引，提供词法或可选 embedding 辅助的代码检索。
- [dsh-commit-review](https://github.com/the-qian/dsh-commit-review) — 一个 DSH 插件：为 Web GUI 增加 /commit 与 /review 两个斜杠命令
- [dsh-computer-use](https://github.com/Anionex/dsh-computer-use) — macOS 电脑控制：Accessibility 观测、过期状态拒绝、作用域权限与安全输入。
- [dsh-computer-use](https://github.com/ZRui-C/dsh-computer-use) — 通过文本命令后台控制 Chromium 和 macOS，不抢占前台或移动鼠标。
- [dsh-context-proxy](https://github.com/EvilIrving/dsh-context-proxy) — 按需取回薄层：context_query / context_slice / context_grep 三个工具读取已持久化的历史，引用可回放。
- [dsh-continual-evolve](https://github.com/ZK-Andy/dsh-continual-evolve) — 持续自进化：从会话轨迹沉淀版本化、可审计、可回滚的 harness 状态（提示词/记忆/技能/子代理规格），带审查门禁与技能热加载。
- [dsh-cowork](https://github.com/Jesse-njx/dsh-cowork) — doc_read/doc_write：以有界、单元格寻址的方式读写 xlsx / pdf / docx / pptx / ipynb，另附 MCP 服务器与 CLI。
- [dsh-custom-tool](https://github.com/omdsh-dev/dsh-custom-tool) — 用 Monaco 编辑器创建和管理沙箱化的自定义 JavaScript 工具。
- [dsh-data-agent](https://github.com/omdsh-dev/dsh-data-agent) — 让 AI 帮你连数据库、写 SQL。
- [dsh-deepresearch](https://github.com/havingautism/dsh-deepresearch) — 为 DeepSeek Harness 提供深度研究工具，自动执行多步骤网络调查并生成报告。
- [dsh-deepseek-vision](https://github.com/Argonaut790/dsh-deepseek-vision) — 增加图像理解、OCR 和视觉证据持久化能力，让纯文本模型能处理并记住视觉信息。
- [dsh-docker](https://github.com/Jesse-njx/dsh-docker) — 类型安全、带护栏的容器控制：ps/logs/inspect/exec/start/stop 与 compose up/down，JSON 输出、项目感知定位、破坏性操作需审批。
- [dsh-docker](https://github.com/STARDUSTLC666/dsh-docker) — DeepSeek Harness 容器管理插件：docker_ps/logs/inspect/exec/manage 五工具，官方 subprocess 服务、argv 无 shell 注入、exec 审批门、零运行时依赖。· Containers for DeepSeek Harness agents.
- [dsh-docs](https://github.com/Sqhao-O/dsh-docs) — 本地解析 PDF、Office、图片和扫描件，支持离线 OCR 文档智能。
- [dsh-email](https://github.com/STARDUSTLC666/dsh-email) — DeepSeek Harness 邮件插件：email_list/read/search/send/folders/attachment 六工具，内置 QQ/163/126/新浪/阿里/Gmail/Outlook/iCloud 八个预设，多账号、附件收发、Web 设置页配置，纯 Node 全平台。· IMAP/SMTP email tools for DeepSeek Harness agents.
- [dsh-exam-countdown](https://github.com/zimai233/dsh-exam-countdown) — 查询 64 场中国考试（高考/考研/四六级/CPA/法考…）的规则日期（第二个周六、第一个周日）与倒计时。
- [dsh-excel-chat](https://github.com/hccccc01333/dsh-excel-chat) — 在 DeepSeek Harness 里对话完成 Excel 工作：建表、编辑、修复公式、图表校验，每次编辑后自动体检公式。
- [dsh-figma-to-lottie](https://github.com/zimai233/dsh-figma-to-lottie) — 将 SVG 路径与关键帧参数编译成自包含的 Lottie JSON 动画文件。
- [dsh-find-plugin](https://github.com/awesome-dsh-plugin/dsh-find-plugin) — 会话内直接找插件：按关键词/分类搜索本精选 registry，返回描述与可直接执行的安装命令。
- [dsh-fleet-audit](https://github.com/LeslieWylie/dsh-fleet-audit) — 只读的 agent 机群凭据卫生审计：检查凭据文件权限、git remote 内嵌凭据（输出脱敏）与 provider token 字面量计数；零依赖、确定性。
- [dsh-free-search](https://github.com/DDDMUC/dsh-free-search) — 通过 DuckDuckGo 提供免密钥的免费网页搜索，直接在聊天中快速检索互联网信息。
- [dsh-full-remote](https://github.com/JUANWANG-BUAA/dsh-full-remote) — 通过公网隧道或局域网实现带令牌的远程设置和文件访问。
- [dsh-github](https://github.com/PivotStackIntelligence/dsh-github) — 将 GitHub 功能集成到 DeepSeek Harness，可能支持仓库交互与工作流。
- [dsh-github-connector](https://github.com/kaziii/dsh-github-connector) — 连接 GitHub，可在对话中创建、审查和合并拉取请求。
- [dsh-github-login](https://github.com/Noob-stupid/dsh-github-login) — DeepSeek Harness 生态的 GitHub 可视化登录工具（零终端）：设备码流程，令牌同步 gh CLI | Visual GitHub login for the DSH ecosystem - no terminal needed
- [dsh-guardian](https://github.com/cdxiaodong/dsh-guardian) — 为 DeepSeek Harness 提供守护或保护类实用功能，可能涉及安全或监控。
- [dsh-harness-mcp-server](https://github.com/chushixixin/dsh-harness-mcp-server) — 将 Harness 代理能力暴露为 MCP 服务器，供外部集成。
- [dsh-hdc-bridge](https://github.com/1na-ko/dsh-hdc-bridge) — 鸿蒙设备桥：hdc 截图/装包/日志/崩溃/UI 自动化闭环（配 read_image 看图），官方优先版本化 API 知识层（SDK .d.ts + 离线随包文档），以及 DevEco CLI 构建/签名/lint 通道。
- [dsh-her-eyes](https://github.com/huashenglian/dsh-her-eyes) — 一个可以让ai自动调用VLM(多模态模型)进行视觉分析的dsh插件。A dsh plugin that allows AI to automatically invoke VLMs (multimodal models) for visual analysis.
- [dsh-hub](https://github.com/omdsh-dev/dsh-hub) — 集线器插件，可能聚合多种工具或服务，具体功能不详。
- [dsh-image-bridge](https://github.com/kbpoyo/dsh-image-bridge) — DSH 插件：让纯文本模型也能看图。Web 端直接粘贴图片即可发送，无需指定图片路径；模型自主调用视觉技能查看，多模态模型原生直通，零skill绑定。
- [dsh-image-search](https://github.com/zimai233/dsh-image-search) — 多引擎反向识图聚合：Google Lens、百度、Yandex、TinEye、SauceNAO、IQDB、Ascii2d。
- [dsh-image2-draw](https://github.com/JuneLearn/dsh-image2-draw) — 通过第三方 OpenAI 兼容接口调用 gpt-image-2 生成图像。
- [dsh-imggenerate](https://github.com/Bald0Wang/dsh-imggenerate) — 提供图像生成工具，支持多家提供商，让用户直接在 DeepSeek Harness 内创建图像。
- [dsh-kb-sieve](https://github.com/omdsh-dev/dsh-kb-sieve) — 从 md/txt/docx/pdf 构建可审计知识库包（SQLite FTS5），确定性检索与原文阅读。
- [dsh-launcher](https://github.com/LvienOeria/dsh-launcher) — 一个轻量的 dsh（DeepSeek Harness）插件：安装一个终端命令，输入 dsh-go 即可启动 harness 并自动打开浏览器。零依赖，约 9 KB。（桌面双击版在独立的 dsh-desktop-launcher 包）
- [dsh-longbridge](https://github.com/omdsh-dev/dsh-longbridge) — 与长桥操作相关的插件，可能提供桥接或连接工具。
- [dsh-LorebookMD](https://github.com/609476965/dsh-LorebookMD) — 导入 Tavern 角色卡和世界书，生成长篇小说散文并引用设定的世界观。
- [dsh-lsp-actions](https://github.com/PerryLink/dsh-lsp-actions) — 通过语言服务器提供诊断、格式化、补全、代码操作、符号、签名、内联提示与重命名能力。
- [dsh-market](https://github.com/dsh-market/dsh-market) — 装在 DSH 里的插件市场：设置页内逛/搜全部社区插件，按分类筛选，确认后一键安装，已装插件一目了然。
- [dsh-mc-launcher](https://github.com/hellosky983/dsh-mc-launcher) — 在 DeepSeek Harness 中启动 Minecraft，提供全屏界面、版本下载和微软登录。
- [dsh-mcp-bridge](https://github.com/Edge-Echo/dsh-mcp-bridge) — 打包精选的 MCP 服务器（记忆、文件、GitHub、Playwright 等），附带连接验证器和 CI 检查，简化集成。
- [dsh-mcp-lens](https://github.com/labmimors/dsh-mcp-lens) — DeepSeek Harness 的渐进式披露 MCP 网关：保持两个面向模型的工具，按需返回排序后的远端精确 inputSchema，再调用明确的 server/tool。
- [dsh-mcp-manager](https://github.com/hyqhyq3/dsh-mcp-manager) — 在设置页管理 MCP 服务器，支持 OAuth 或静态令牌认证，并注册相关工具。
- [dsh-md-preview](https://github.com/LeslieWylie/dsh-md-preview) — 把 Markdown 渲染为自包含的独立 HTML 页面：提供在 headless 配置下同样可用的 `md_html_render` 工具，以及在网页端浏览、预览、编辑并导出本地 `.md` 文件的抽屉；两个入口共用同一个渲染器，无运行时依赖。
- [dsh-media-skills](https://github.com/akqwpeter-prog/dsh-media-skills) — 提供免费读图和生图能力，多模型容错，无需 API 密钥。
- [dsh-mobile-gate](https://github.com/Bernardxu123/dsh-mobile-gate) — LAN mobile gateway for DeepSeek Harness (DSH): first-visit approval, per-device tokens, rate limiting, mobile layout injection. 局域网手机安全访问 DSH 的即插即用网关：本机审批、设备令牌、限流、手机端适配。
- [dsh-mobile-gui-agent](https://github.com/kunjinkao-os/dsh-mobile-gui-agent) — Android GUI Agent：ADB 截图、压缩 UI hierarchy 定位、逐步动作验证、审批和 Mobile Web 视图。
- [dsh-multimodal](https://github.com/MC5lan/dsh-multimodal) — 给 DeepSeek 安装一双眼睛和一支画笔:会话里直接贴截图/图片,GLM 视觉模型先精确转写图片内容(报错信息、代码、界面逐字保留),然后 DeepSeek 继续处理你的问题——同一轮完成,全程无感;需要配图时,DeepSeek 自动调用文生图后端出图并显示在会话中。
- [dsh-museai-tavern](https://github.com/yejiming/dsh-museai-tavern) — MuseAI的DeepSeek Harness插件，可以将你的MuseAI角色放进DSH使用啦！
- [dsh-net-proxy](https://github.com/mafeis/dsh-net-proxy) — 让 agent 的网络请求走本机 HTTP/CONNECT/SOCKS5 代理。
- [dsh-oauth-mcp-client](https://github.com/springbrand-lab/dsh-oauth-mcp-client) — 为 DeepSeek Harness 提供的 OAuth 2.1 Streamable HTTP MCP 客户端。
- [dsh-obsidian-assistant](https://github.com/iamzcr/dsh-obsidian-assistant) — DeepSeek Harness 插件（Cordis toolset）：操作本地 Obsidian 知识库（vault），提供搜索、读写笔记、双向链接 / 关系图谱、批量整理，并通过 Obsidian 的 "Local REST API" 社区插件调用高级能力（高速全文搜索、触发命令 / 模板）。
- [dsh-ocgo-lite](https://github.com/OK-wx/dsh-ocgo-lite) — OpenCode Go 用量常驻条：套餐余量圆环 + token/花费实时统计（本次会话/全部范围 + 按模型联动，官方实时定价），一键复制 API Key。OpenCode Go usage bar for DeepSeek Harness.
- [dsh-office](https://github.com/omdsh-dev/dsh-office) — 在工具内生成、读取和编辑电子表格、PDF 和演示文稿等办公文档。
- [dsh-onebot](https://github.com/Hoshino-Yumetsuki/dsh-onebot) — 让 DeepSeek Harness 兼容 OneBot 协议，支持与 QQ 等消息平台集成实现远程交互。
- [dsh-openapi](https://github.com/Degurechaff57/dsh-openapi) — 提供安全的 OpenAPI 发现与调用工具。
- [dsh-opencode-go-box](https://github.com/yascitom/dsh-opencode-go-box) — 监控并报告 OpenCode Go 的用量情况。
- [dsh-openmaic](https://github.com/THU-MAIC/dsh-openmaic) — OpenMAIC 教学：课堂、幻灯片、交互组件与苏格拉底式教学。
- [dsh-overleaf](https://github.com/fly233338/dsh-overleaf) — 通过 OverleafMCP 将多个 Overleaf 项目接入 DSH，支持浏览、分析和通过 Git 写回 LaTeX 文件。
- [dsh-pdf](https://github.com/sunshine-lang/dsh-pdf) — 使用 pdfjs-dist 本地提取 PDF 文本、元数据和页面范围，无需 API 密钥。
- [dsh-permgate](https://github.com/MrWeiCodes/dsh-permgate) — 为 DeepSeek Harness（DSH）提供的细粒度权限控制插件
- [dsh-permission-rules](https://github.com/PerryLink/dsh-permission-rules) — 为工具添加声明式允许/拒绝/询问规则，支持参数和路径匹配，并带审计日志。
- [dsh-phone](https://github.com/railgun0325/dsh-phone) — 让 DeepSeek Harness 的 agent 跑在手机里，通过 Magisk root 原生操作安卓系统（截图/点击/滑动/开应用）+ 移动端布局 + WebView APK
- [dsh-playwright-browser](https://github.com/Clizo1209/dsh-playwright-browser) — 通过 Playwright 提供浏览器自动化，支持导航和交互等任务。
- [dsh-plugin](https://github.com/PicGo/dsh-plugin) — 通过 PicGo 已有配置（PicGo Cloud、GitHub、S3、腾讯云 COS、七牛，或任意已安装的上传插件）把本地图片和文件上传到图床，提供 `picgo_upload` 工具与 `/picgo` 命令。
- [dsh-plugin](https://github.com/Tabbit-Browser/dsh-plugin) — 将 Tabbit 浏览器与 DSH 集成，让 AI 代理具备浏览器控制与自动化能力。
- [dsh-plugin-aigc-canvas](https://github.com/HuanLinOTO/dsh-plugin-aigc-canvas) — 提供无限画布与 AIGC 生成、媒体编辑及画布连接工具。
- [dsh-plugin-anti-ads](https://github.com/HuanLinOTO/dsh-plugin-anti-ads) — DSH Web 广告拦截器，四层独立防御拦截 dsh-ads 插件的所有广告位 | DSH Web ad blocker with four independent defense layers targeting the dsh-ads plugin
- [dsh-plugin-anydoc](https://github.com/beancookie/dsh-plugin-anydoc) — 将 Word、PPT、Excel、PDF 等文档转换为 GitHub 风格 Markdown。
- [dsh-plugin-browser](https://github.com/qichuang321/dsh-plugin-browser) — 用于浏览和管理已安装插件的浏览器工具。
- [dsh-plugin-center](https://github.com/crTnT/dsh-plugin-suite) — 插件中心：在设置页内发现、安装和管理 DSH 插件。
- [dsh-plugin-deepeye](https://github.com/Favio8/dsh-plugin-deepeye) — 提供图像描述、OCR、VQA、UI 布局与剪贴板分析。
- [dsh-plugin-deepseek-vision](https://github.com/GOU-GEE/deepseek-vision) — 为纯文本 DeepSeek 提供视觉能力的 MCP 与 DSH bundle：analyze_image、analyze_clipboard、compare_images 与 vision_status 工具，可视化设置页，默认使用免费 GLM-4.6V-Flash，带结果缓存与限流容错；密钥不进日志。
- [dsh-plugin-interpreters](https://github.com/HuanLinOTO/dsh-plugin-interpreters) — 提供 Python 与 Node 代码执行工具，返回输出并支持配置解释器路径。
- [dsh-plugin-knowledge-graph](https://github.com/Luke-Yong/dsh-plugin-knowledge-graph) — 基于代码库知识图谱的 read_graph 工具（CONTAINS / EXPORTS / IMPORTS / IMPORTS_SYMBOL 关系）。
- [dsh-plugin-market](https://github.com/NanmiCoder/dsh-plugin-market) — 经认证的插件市场，可发现、查看、安装和卸载DSH插件。
- [DSH-Plugin-Market](https://github.com/nanshan1995/DSH-Plugin-Market) — DeepSeek Harness 插件市场：精选目录 + GitHub 实时浏览、中英翻译搜索、安装前静态安全审计闸门。Plugin market for DeepSeek Harness with a pre-install security audit gate.
- [dsh-plugin-mineru](https://github.com/HuanLinOTO/dsh-plugin-mineru) — 向模型暴露 MineRU 文档解析工具。
- [dsh-plugin-sleep](https://github.com/HuanLinOTO/dsh-plugin-sleep) — 向模型暴露 sleep 工具，按指定毫秒暂停执行后返回，支持取消/clamp | Exposes a sleep tool that pauses for specified ms then returns, with cancellation/clamping
- [dsh-plugin-store](https://github.com/0xKcyzz/dsh-plugin-store) — DeepSeek Harness 插件商店：浏览、搜索、筛选并一键安装 dsh-plugin 生态插件
- [dsh-plugin-text-translation](https://github.com/1738348785/dsh-plugin-text-translation) — 本地化文本与文档，支持标签保护提取和无损重组。
- [dsh-plugin-updater](https://github.com/crTnT/dsh-plugin-suite) — 已装插件的更新管理器：检查更新、备份与回滚。
- [dsh-plugin-writing-guard](https://github.com/xmutfyh/dsh-plugin-writing-guard) — 在 AI 辅助学术修订中维护科学完整性，保护事实和论证。
- [dsh-promotion-toolkit](https://github.com/lhmd/dsh-promotion-toolkit) — 把你的任何想法，变成每个平台原生的宣发内容 | Turn any idea into platform-native publicity
- [dsh-prompt-enhancer](https://github.com/Fishsb/dsh-prompt-enhancer) — DeepSeek Harness DSH 提示词增强插件：✨ 一键优化草稿，增强提示词。
- [dsh-prompt-polish](https://github.com/JoukoPuro/dsh-prompt-polish) — 一个 DeepSeek Harness（DSH）插件： 在 Web 输入框的工具行中添加一个 ✨ 图标按钮。点击后选择打磨风格，已接入的大模型 会把你草稿中的提示词改写得更专业、更易被 AI 理解 。A DeepSeek Harness plugin: icon-only composer button that rewrites your prompt via the connected LLM (balanced/concise/detailed/code styles, i18n)
- [dsh-read-image](https://github.com/OoWJZZoO/dsh-read-image) — 将图片映射为标记，使代理能调用工具读取会话中的图像。
- [dsh-read-url](https://github.com/2672243194/dsh-read-url) — 抓取网页并转换为干净的正文文本或 Markdown，支持自动字符集和缓存。
- [dsh-recommend](https://github.com/zp-home/dsh-recommend) — DSH 插件透明排行与推荐：每日自动抓取 `dsh-plugin` 话题生态，公开评分模型，提供 rank/search/recommend 工具与设置页榜单。
- [dsh-remote](https://github.com/flymysql/dsh-remote) — 多机远程工作区：管理多台 SSH 主机，在原生「添加工作区」流程里选本机系统文件夹或远程目录，把远程工作区镜像成真实本地文件夹并用 rw_* 工具操作。
- [dsh-remote-tunnel](https://github.com/Linjiangxian0203/dsh-remote-tunnel) — 管理远程主机的端口分配、注册表和弹性 SSH 隧道。
- [dsh-reviewer-bot](https://github.com/chaojixinren/dsh-reviewer-bot) — 原生DSH插件形态的代码评审机器人，支持多平台、可插拔规则和本地重放。
- [dsh-robotic-harness](https://github.com/dingkaihu63/dsh-robotic-harness) — 提供具身智能研究工具，包括机器人资产检查、MuJoCo 模拟和基于证据的诊断。
- [dsh-scholar](https://github.com/lzszq/dsh-scholar) — 学术助手插件。
- [dsh-sci](https://github.com/Blaczz/dsh-sci) — 提供单位换算、物理常量和龙格库塔 ODE 仿真等科学计算工具，无需改动核心。
- [dsh-search-boost](https://github.com/Mr-remon219/dsh-search-boost) — 通过增强检索机制提升模型的搜索能力。
- [dsh-search-mcp](https://github.com/gxpppp/dsh-search-mcp) — 用可配置的搜索MCP服务器替换内置搜索，支持Tavily/Brave/Exa等多种引擎。
- [dsh-self-control-guard](https://github.com/pandashere/dsh-self-control-guard) — 为主机退出和重启流程添加自我控制保护，防止误操作。
- [dsh-session-audit](https://github.com/bwndlct/dsh-session-audit) — 会话执行分析：步骤、工具调用、失败、重复动作、token 用量与验证信号，输出 text/Markdown/JSON 报告。
- [dsh-simplify](https://github.com/GongYuanCaiJi/dsh-simplify) — DeepSeek Harness 插件：审查最近改动的代码，就清晰度、一致性与可维护性提出改进（移植自 pi-simplify）
- [dsh-skillport](https://github.com/Jesse-njx/dsh-skillport) — 把已有的 Agent Skills（SKILL.md）技能库带进 DSH：扫描 Claude/Codex/Cursor/Gemini 技能目录、注入渐进式索引，按需加载技能正文。
- [dsh-skills-mcp-manager](https://github.com/zebbkira/dsh-skills-mcp-manager) — 面向 DeepSeek Harness Web GUI 的正式插件包：在设置页的「Web UI 插件」分组中新增一张「技能与 MCP」卡片，用于在浏览器里管理技能（skills）与 MCP 服务器。
- [dsh-ssh](https://github.com/UynajGI/dsh-ssh) — 支持 SSH 远程执行，包括跳板链、SFTP 文件系统及子进程/PTY 操作。
- [dsh-stock-watch](https://github.com/Awu12277/dsh-stock-watch) — A股自选股实时行情盯盘插件 - DeepSeek Harness Web 右上角可折叠弹窗
- [dsh-subagent-cwd](https://github.com/lynx-gt/dsh-subagent-cwd) — 在 dsh-subagent-tools 基础上增加子代理按调用 cwd，附带所需的两个 in-process provider 补丁。
- [dsh-subagent-max](https://github.com/aaravarr/dsh-subagent-max) — 提供子代理模型工具及实时多面板查看器，用于管理子代理。
- [dsh-subagent-tools](https://github.com/lynx-gt/dsh-subagent-tools) — 子代理委派的按调用覆盖：model/provider/persona/toolFilter、@preset: 引用与 provider/model 组合 id。
- [dsh-subscribe](https://github.com/zoahdev/dsh-subscribe) — Steam 风格插件商店：可在 DSH 内浏览的插件仓库，一键安装、卸载与更新，另有零依赖 CLI 与 Agent 可调用的市场工具。
- [dsh-surfing-plugin](https://github.com/cyijun/dsh-surfing-plugin) — 为 DeepSeek Harness 接入 SearXNG 搜索与 Crawl4AI 抓取能力。
- [dsh-tailscale-sync](https://github.com/MoonGlassKitty/dsh-tailscale-sync) — Zero-config Tailscale sync for DeepSeek Harness (dsh-plugin). 零配置：在手机上继续电脑端 DeepSeek Harness 的工作。
- [dsh-tavern](https://github.com/Player-MINEPIG/dsh-tavern) — 使 DeepSeek Harness 兼容 SillyTavern 素材，增强角色扮演交互。
- [dsh-tensorlake-sandbox](https://github.com/tensorlakeai/dsh-tensorlake-sandbox) — 提供沙箱环境，在 Harness 中安全运行代码与工具。
- [dsh-tool-calculator](https://github.com/omdsh-dev/dsh-tool-calculator) — 安全的数学表达式求值器，零依赖递归下降解析器。
- [dsh-tool-csv](https://github.com/omdsh-dev/dsh-tool-csv) — CSV 解析/查询/统计/转换（RFC 4180），零依赖状态机解析器。
- [dsh-tool-diff](https://github.com/omdsh-dev/dsh-tool-diff) — 文本/JSON/CSV/Markdown 结构化比较与 unified diff。
- [dsh-tool-encoding](https://github.com/omdsh-dev/dsh-tool-encoding) — base64/url/hex 编解码、常用哈希、UUID 生成。
- [dsh-tool-git](https://github.com/lxj808624/dsh-tool-git) — 提供结构化的 Git 操作，并带有破坏性命令安全防护。
- [dsh-tool-json](https://github.com/omdsh-dev/dsh-tool-json) — JMESPath 子集 JSON 查询。
- [dsh-tool-markdown](https://github.com/omdsh-dev/dsh-tool-markdown) — HTML↔Markdown 转换、GFM 表格规范化、目录生成。
- [dsh-tool-regex](https://github.com/omdsh-dev/dsh-tool-regex) — 正则测试/提取/安全替换/静态解释（不执行代码）。
- [dsh-tool-schema](https://github.com/omdsh-dev/dsh-tool-schema) — JSON Schema 验证：validate/paths/explain/normalize。
- [dsh-tool-search](https://github.com/Letter2025/dsh-tool-search) — Hermes 风格工具搜索与瘦身：渐进式披露，语义搜索/查看/调用长尾工具，核心工具保持直通。
- [dsh-tool-search](https://github.com/vibeinging/dsh-tool-search) — 按 agent 的按需工具发现与渐进式 schema 披露。
- [dsh-tool-stat](https://github.com/omdsh-dev/dsh-tool-stat) — 描述统计/百分位数/频数分布/相关性。
- [dsh-tool-tavily-search](https://github.com/moguiyu/dsh-tavily) — Tavily 搜索：多 API key、轮换与故障转移、用量仪表与设置卡片。
- [dsh-tool-time](https://github.com/omdsh-dev/dsh-tool-time) — 严格 ISO 8601 解析、IANA 时区转换、UTC 日历运算。
- [dsh-tool-underseal](https://github.com/Hyperionjust/dsh-tool-underseal) — 为 DeepSeek Harness 提供工具功能的插件。
- [dsh-toolkit](https://github.com/omdsh-dev/dsh-toolkit) — 零依赖工具包：time / encoding / json / calculator / csv / regex / markdown / diff / stat / schema 十件套一键安装。
- [dsh-trio](https://github.com/huey1in/reef) — 浏览器自动化（Playwright，带实时画面）+ MCP Server（把 DSH agent 暴露给任何 MCP 客户端）+ GitHub issue/PR/webhook 评审工具。
- [dsh-undo-plugin](https://github.com/lire1131/dsh-undo-plugin) — DSH 撤销/回退系统：配置变更自动存档，一键撤销/恢复/回退到任意版本，支持 WebUI 与离线 CLI/GUI 工具（DSH 启动失败也能救）。
- [dsh-us-stocks](https://github.com/Realyujie/dsh-us-stocks) — 提供美国股市数据工具，基于 yahoo-finance2 获取实时行情。
- [dsh-video-downloader](https://github.com/zimai233/dsh-video-downloader) — 检测并下载 B站/YouTube/抖音/小红书视频媒体，带清晰度与格式分析。
- [dsh-vision](https://github.com/linenxi-ctrl/dsh-vision) — 为 DeepSeek Harness 增加外挂识图模型：圆形鲸鱼按钮、发送图片识图自动回传、模型自主截图+识图工具、多协议自动适配、小白一键安装（未装 Node.js 自动下载）
- [dsh-vision](https://github.com/TZHR-invest/dsh-plugins) — Agent 可调用的视觉工具：通过自行配置的任意 OpenAI 兼容视觉端点描述本地图片，支持可选的多模型交叉校验，不内置密钥。
- [dsh-vision-bridge](https://github.com/ximengxiaolan/dsh-vision-bridge) — 输入框贴图自动识别：由 OpenAI 兼容视觉模型转成文字描述后，再交给纯文本 DeepSeek 模型处理。
- [dsh-vision-proxy](https://github.com/Flyvhidbwo/dsh-vision-proxy) — DeepSeek 大脑 + 自动识图：GUI 附加的每张图片自动经 OpenAI 兼容 VLM 转译成文字，再交给纯文本的 DeepSeek 作答——默认走免费匿名端点（零配置），填自己的 key 可启用付费快速通道（qwen3.7-flash，支持 DashScope/智谱/Ollama/OpenRouter）。
- [dsh-vision-router](https://github.com/ysr666/dsh-vision-router) — 为纯文本 Agent 提供视觉能力：内置免 Key 视觉链 + 像素级视觉工具（看图问答、定位、裁剪、像素对比、取色、OCR、矢量化、抠图、截图）；粘贴图片即可用。
- [dsh-vision-sidecar](https://github.com/121103qwq/dsh-vision-sidecar) — 托管免费视觉侧车，为图像任务提供持久会话证据。
- [dsh-vision-toolkit](https://github.com/Anionex/dsh-vision-toolkit) — 让纯文本模型更好地做视觉任务：带意图的图片问答、长截图 OCR、UI 还原等。
- [dsh-visual-plugin](https://github.com/jyh20030112/dsh-visual-plugin) — 将用户图片转发至视觉模型，让纯文本模型获得视觉能力，并在Web面板显示结果。
- [dsh-voice](https://github.com/3274375092/dsh-voice) — 通过本地或浏览器语音识别将语音转为文本并作为消息提交。
- [dsh-voice](https://github.com/Jesse-njx/dsh-voice) — 语音输入、语音输出：把口述音频转写为用户消息（transcribe），让 agent 朗读回复（speak），本地优先，音频存于 ~/.dsh/voice。
- [dsh-wash-calendar](https://github.com/zimai233/dsh-wash-calendar) — 基于纯日期数学的周期习惯排程：下次发生日、区间排程与逾期提醒。
- [dsh-weather](https://github.com/sunshine-lang/dsh-weather) — 通过免费的 Open-Meteo 服务提供当前天气和多日预报，无需 API 密钥。
- [dsh-web-lan-access](https://github.com/AcidGr/dsh-web-lan-access) — 允许局域网内设备访问 DeepSeek Harness Web 界面。
- [dsh-web-open](https://github.com/dawsondx/dsh-web-open) — 当 Web 服务就绪后，自动打印完整 GUI 地址并调用默认浏览器打开。
- [dsh-web-search-exa](https://github.com/TonyDua/dsh-web-search-exa) — ctx.web 接缝的零配置 Exa 网页搜索提供方：无 API key 时走匿名 MCP 兜底，配 key 时走 REST 搜索。
- [dsh-webui-market-plugin](https://github.com/Sanqi-normal/dsh-webui-market-plugin) — dsh Web GUI 内的社区插件市场：浏览 awesome-dsh-plugin.com 目录，从 设置 → 插件 → 插件市场 安装/卸载插件到 profile。
- [dsh-windows-ocr](https://github.com/maxwell-feng/dsh-windows-ocr) — 在 Windows 上对截图或图片进行 OCR 文字提取。
- [dsh-workshop](https://github.com/loguhan/dsh-workshop) — DSH Web UI 的 Steam 创意工坊式插件商店：浏览、搜索并一键安装社区插件，支持镜像加速、进度 UI、安全检测与中文描述。
- [dsh-workspace](https://github.com/Hakunm/dsh-workspace) — 一个把文件工作区直接带进 DeepSeek Harness WebUI，并为手机和第三方客户端提供稳定的远程接口插件。A bilingual file workspace and secure remote API for DeepSeek Harness WebUI and mobile clients.
- [dsh-workspace-env](https://github.com/Momojie-S/dsh-workspace-env) — 为 shell 子进程注入按工作区配置的 .env 环境变量。
- [dsh-workspace-mcp](https://github.com/Momojie-S/dsh-workspace-mcp) — 按工作区加载MCP服务器，实现代理级工具集成。
- [dsh-wsl-workspace](https://github.com/6Mikao9/dsh-wsl-workspace) — 在 GUI 中直接添加 WSL 工作区，无需在 WSL 内安装 dsh。
- [dsh-zotero](https://github.com/Vncntvx/dsh-zotero) — 让代理搜索、阅读并引用本地 Zotero 文献库，包括论文、笔记、注释与引用。
- [dsh1024](https://github.com/imsai-sh/awesome-deepseek-harness-plugins) — DSH 1024Store 官方商店插件：设置页内浏览/搜索 deepseek1024.com 实时目录，按分类筛选，确认后一键安装/卸载，支持自更新检查。
- [forge-gates](https://github.com/jinguanghai/deepseek-harness-forge-plugins) — 真实计算验证门：数学化简、逻辑证明、正则校验、E-prover 一阶逻辑、状态机检查与代码修复，由 Go 编译的二进制支撑并附带预编译 Windows 可执行文件。
- [forge-tcm](https://github.com/jinguanghai/deepseek-harness-forge-plugins) — 中医工具集：八纲辨证与药对查询。
- [Gemini-Eyes](https://github.com/ConsoleSun/Gemini-Eyes) — 为 DeepSeek Harness 接入 Gemini 视觉能力。
- [godot-bridge](https://github.com/Smalldy/godot-bridge) — 通过 TCP 启动并控制运行中的 Godot 游戏，替代 MCP 服务器。
- [harness-ai-kit](https://github.com/seed-forge/harness-ai-kit) — 管理多种编程工具中的 AI 代理资产，如技能、命令行、MCP 和循环。
- [HoloGram](https://github.com/834063245-creator/HoloGram) — 生成 3D 代码依赖图，内置 LLM 代理，支持 14 门语言、耦合分析和实时监控。
- [local-shell-mcp](https://github.com/fwerkor/local-shell-mcp) — 让大模型能操作命令行环境，直接执行 Shell 命令与工具。
- [mirage](https://github.com/strukto-ai/mirage) — 为 AI 智能体提供统一的虚拟文件系统，使不同工具和环境间的文件访问保持一致。
- [modlens](https://github.com/liustack/modlens) — 为纯文本模型架起视觉桥梁：粘贴图片，输出结构化 JSON 证据（OCR、版面、语义）。
- [modsearch](https://github.com/liustack/modsearch) — 纯文本 agent 的联网搜索桥：搜索网页与 X，返回结构化 JSON 证据（search/fetch/引用）。
- [noatmark-dsh-plugin](https://github.com/ylwl1997/noatmark-dsh-plugin) — 文本卫生 dsh 插件：净化不可信文本、扫描隐形字符、清洗 LLM 格式、转义 CSV 公式注入。
- [pack-agent](https://github.com/sakikoTGW/pack-agent) — 把 .pack.json/.pack.zip 投影到 .agent-pack/modpacks/，按工作区白名单暴露 skill。
- [paste-to-workspace](https://github.com/LQ-1123/paste-to-workspace) — DSH 插件：把粘贴/拖入聊天框的图片与任意文件保存为会话工作区文件。官方 bundle 插件，安装：dsh plugin --profile web add github:LQ-1123/paste-to-workspace
- [plugin-manager](https://github.com/whyihaveyou/dsh-suite) — DSH Web UI 内置插件商店：浏览、搜索、一键安装，附兼容性标识。
- [pptfast](https://github.com/liustack/pptfast) — 为 AI agent 生成稳定、可编辑的 PPTX 文件，从语义中间表示转换。
- [ru-marketplace-mcp](https://github.com/Vladimir-Human/ru-marketplace-mcp) — 为九个俄罗斯电商平台和淘宝提供MCP服务器，无需密钥即可只读访问并跨平台比价。
- [sealos-skills](https://github.com/labring/sealos-skills) — Sealos技能包，支持用一条命令部署项目、配置数据库和对象存储，兼容多种AI命令行工具。
- [snapgrep](https://github.com/Owen718/snapgrep) — 利用进程内三元索引加速代码搜索，性能超越 ripgrep。
- [SpecFusion](https://github.com/wxkingstar/SpecFusion) — 搜索工具，提供20个中国开放平台的6.5万+API文档，零配置，支持Skill和原生DSH插件。
- [treg](https://github.com/superdesigndev/treg) — 充当智能体工具的 OpenRouter，通过统一 API 聚合和路由工具访问。
- [tuning-engines-cli](https://github.com/cerebrixos-org/tuning-engines-cli) — 提供命令行与 MCP 服务，用于对代码库进行模型微调。

</details>

<a id="skill"></a>

<details>
<summary><strong>技能包</strong> · 45 个插件</summary>

- [Aegis](https://github.com/GanyuanRan/Aegis) — 通过基线优先、证据验证和漂移检查的规范，让编码智能体在长任务中保持架构意识。
- [Agent_Extensions](https://github.com/DDDFXYqiming/Agent_Extensions) — Agent Skills & DeepSeek Harness (DSH) 扩展库：通用智能体技能（General_skills）+ DSH 标准插件（dsh-plugin），开箱即用的 AI Agent 能力增强集合。
- [airesearch-plugin](https://github.com/WOOK98/airesearch-plugin) — 面向股票研究的 AIResearch 技能包：单页快照、六视角个股深度研究、盘前 watchlist 简报、行业主题映射与 SEC 文件分析。
- [archify](https://github.com/tt-a1i/archify) — 生成美观且可验证的架构、流程、时序、数据流和生命周期图，输出为自带动画的自包含 HTML，并支持清晰导出。
- [Cobsidian](https://github.com/Totoro-qaq/Cobsidian) — 用于维护Obsidian知识库的通用工作流技能，提供结构化笔记整理与检索方法。
- [dsh_plugin_swift_cycle](https://github.com/Solismuchengxue/dsh_plugin_swift_cycle) — 用户调用、版本固定且可离线验证的治理技能适配器，用于结构化任务执行。
- [dsh-anchored-standard](https://github.com/Jungod1121/dsh-anchored-standard) — 两阶段预设：先使用极简工具，首次交互后扩展为完整标准工具集。
- [dsh-awiki](https://github.com/AgentConnect/dsh-awiki) — 提供 AWiki 身份与消息功能，可能为 DeepSeek Harness 带来特定人设与交互方式。
- [dsh-chinese-traditional-wisdom-skill](https://github.com/dhicoc/dsh-chinese-traditional-wisdom-skill) — 中华传统智慧（玄枢）AI Agent 技能包的 DeepSeek Harness（dsh）Cordis 插件：八字/紫微/六爻/梅花/奇门/风水/五运六气/体质全融合，本地确定性引擎 + 可视化 Dashboard，一行 dsh plugin add 安装。
- [dsh-codex-port](https://github.com/STARDUSTLC666/dsh-codex-port) — DeepSeek Harness 技能移植插件：把 ~/.codex 的 Codex 官方插件（186+ 个、583+ 技能）一键移植为 DSH 技能（codex_list/port/status），frontmatter 自动转换、幂等跳过。· Batch-port the Codex plugin family into DSH skills.
- [dsh-design-skills](https://github.com/zhaiyateng/dsh-design-skills) — 提供六种设计美学风格的技能包，帮助网站摆脱千篇一律的AI外观。
- [dsh-director-toolkit](https://github.com/lhmd/dsh-director-toolkit) — 将模糊创意转化为针对 Blender、Three.js、Houdini 或 C4D 的结构化方向包。
- [dsh-expert-mode](https://github.com/Asher-2000/dsh-expert-mode) — DSH (DeepSeek Harness) 专家模式 agent preset — 首席协调官 + 11 位领域专家子代理 Expert-mode preset for DeepSeek Harness
- [dsh-godot-skill](https://github.com/akira399/dsh-godot-skill) — 注册 Godot 4.x 全栈游戏开发技能，助力游戏开发。
- [dsh-learn-everything](https://github.com/cendaifeng/dsh-learn-everything) — 提供面向学习场景的技能包或提示词，助力用户在 DeepSeek Harness 中探索与掌握知识。
- [dsh-pentest](https://github.com/howmp/dsh-pentest) — 面向 DeepSeek Harness（dsh）的渗透测试模式 @CloverSecLabs
- [dsh-plugin-auto-blame](https://github.com/HuanLinOTO/dsh-plugin-auto-blame) — 模型回合结束后用 LLM 生成 3 条批判性跟进建议，点击即发送 | After a model turn, an LLM generates 3 critical follow-up suggestions shown as click-to-send chips
- [dsh-plugin-claude-bridge](https://github.com/YYTbit/dsh-plugin-claude-bridge) — 将 Claude Code 的记忆、技能和配置导入 Harness 以便复用。
- [dsh-plugin-dev-skills](https://github.com/zimodzh/dsh-plugin-dev-skills) — 提供一套 Agent Skills，规范跨多个 AI 编码助手的 DSH 插件开发流程。
- [dsh-plugin-guide](https://github.com/PerryLink/dsh-plugin-guide) — 可安装的插件开发知识库，作为按需代理技能提供。
- [dsh-portable-tavern](https://github.com/XCNXNXNX/dsh-portable-tavern) — DeepSeek Harness 的「便携酒馆」插件：RPG 式 SillyTavern V2/V3 角色卡生成器 + 酒馆角色扮演聊天。支持世界书、角色卡 JSON/PNG 导入导出、面板主题与本地音乐。独立插件，仅依赖官方 @deepseek-ai SDK。
- [dsh-prompt-manager](https://github.com/errorcode7/dsh-prompt-manager) — DeepSeekHarness的提示词管理器插件
- [dsh-reverse-skill](https://github.com/dhicoc/dsh-reverse-skill) — 一个为 DeepSeek Harness 注册 85 个逆向工程、授权渗透测试与安全研究技能的 Cordis 插件。
- [dsh-skill-manager](https://github.com/Lanxing6480/dsh-skill-manager) — Deepseek Harness 的Skill管理插件
- [dsh-skill-manager](https://github.com/sulfide2085/dsh-skill-manager) — 在 DeepSeek Harness 设置页统一管理 DSH / Codex / Claude 的 AI 技能：热开关启停、GitHub 技能市场一键发现安装、本地 ZIP 导入（dsh-plugin skill hub）
- [dsh-skill-manager](https://github.com/YTxue/dsh-skill-manager-ytxue) — 设置侧边栏的 Skill 管理器：池与启用目录启停、文件夹批量导入（重名询问）、状态驱动一键规范检查与自动修复、系统级/项目级来源标识。
- [dsh-skills](https://github.com/CocoSgt/dsh-skills) — 为 DeepSeek Harness 提供技能集合，可能增强代理能力。
- [dsh-skills-manager](https://github.com/MichengAI/dsh-skills-manager) — 管理 DeepSeek Harness 的技能，帮助用户组织和运用技能集合。
- [DSH-Think-zh](https://github.com/Len7183/DSH-Think-zh) — DeepSeek Harness 默认的思考语言为英文，这不利于中文使用者阅读推理过程与复核结论。本插件通过在每次请求的 system prompt 中注入一条精简的强制语言指令，使: 思考过程强制简体中文，无论用户用什么语言提问。
- [dsh-tool-writing](https://github.com/x2802490130-prog/dsh-tool-writing) — 面向长篇小说创作，提供设定管理、语义检索与语料库。
- [dsh-youmind-plugin](https://github.com/seamas0825-lab/dsh-youmind-plugin) — 打包 YouMind OpenAPI 工具和技能定义，扩展 DeepSeek Harness 的能力。
- [folio-events](https://github.com/nyantused-cpun/folio) — Folio（兰亭）@folio/dsh-events：会话协议事件——会话开始自动提醒与会话关闭自动保存，与 @folio/dsh-tools 搭配使用。
- [folio-tools](https://github.com/nyantused-cpun/folio) — Folio（兰亭）@folio/dsh-tools：咨询文档生成引擎的 15 个 schema 校验工具（记忆 + 质量门），与 @folio/dsh-events 搭配组成完整会话协议。
- [harmony-next.skills](https://github.com/linhay/harmony-next.skills) — 提供 HarmonyOS NEXT 开发的专家指南，涵盖 IDE 操作、性能调优、架构和自动化测试。
- [helm-d](https://github.com/ADWMC/helm-d) — 打包 Android、Web、原生、协议与 AI 领域的安全分析技能集合。
- [hermes-dsh-collab](https://github.com/Cavan-Ou/hermes-dsh-collab) — 实战验证的多代理协作技能包，涵盖模型路由、规范与 Git 规则。
- [humanizer-ru](https://github.com/Vladimir-Human/humanizer-ru) — 检测并去除俄语文本的机器生成痕迹，通过模式和正则标记使文本更自然。
- [humanizer-ru-dsh](https://github.com/Vladimir-Human/humanizer-ru) — 清理俄语文本中的 AI 痕迹：识别聊天机器人复制粘贴的痕迹（ChatGPT、Gemini、Grok、Perplexity、DeepSeek），按需改写为自然文风；39 条正则标记与证据登记，离线纯文本 bundle。
- [quantum-practices](https://github.com/unitarylab/quantum-practices) — 提供量子算法最佳实践，可能作为技能或参考资料集。
- [skills](https://github.com/creght-dev/skills) — Creght 平台建站技能包：CLI 拉取/推送同步、页面与组件规范、CMS、表单、Auth、SEO、发布与版本回滚。
- [skills](https://github.com/upstash/skills) — 提供一套针对 Upstash 服务和产品的技能集合。
- [SumSec-Skills](https://github.com/SummerSec/SumSec-Skills) — SummerSec 个人自定义Skill仓库
- [superdesign-skill](https://github.com/superdesigndev/superdesign-skill) — 为编码智能体提供设计技能，将 AI 生成的界面转变为精致、可发布的前端设计。
- [superpowers-dsh](https://github.com/LayneChai/superpowers-dsh) — 为 DSH 引入 Superpowers 技能，涵盖测试驱动开发、调试、规划与协作方法。
- [write-chinese-long-screenplay](https://github.com/mudden2380078550-creator/write-chinese-long-screenplay) — 中文电影与剧集长剧本写作 skill

</details>

<a id="workflow"></a>

<details>
<summary><strong>工作流与自动化</strong> · 54 个插件</summary>

- [aflare](https://github.com/alib8b8/aflare) — 本地优先的自动化 Agent · 数据不出本地 · 连接你自己的 LLM / 数据库 / 知识库 · ReAct 推理 · 300+ 技能模板 · 确定性工作流执行（DAG/WAL/Saga/幂等） · MCP 协议 · 离线/内网可用
- [allinluna](https://github.com/zenx0x/allinluna) — 为 Codex 和 DSH 编排资源感知的多代理协作，自动化复杂任务流程。
- [clawock](https://github.com/KCNyu/clawock) — 运行一个由 AI 辩论、代码裁决的决策工作流。
- [dsh_workflow](https://github.com/icetomoyo/dsh_workflow) — 把 UltraCode 式多 Agent 调度带给 DSH：可生成、可保存、可治理、可观察、可恢复的 Workflow 层。
- [dsh-a2a](https://github.com/dpskh/dsh-a2a) — 构建 Agent 间网格，实现多智能体协作与消息互通。
- [dsh-advisor](https://github.com/omdsh-dev/dsh-advisor) — 搭配一个副模型，每轮被动审查并注入见解。
- [dsh-agent-relay](https://github.com/Noelune/dsh-agent-relay) — 本地多代理协作中继，带HMAC认证的回环消息代理。
- [dsh-agent-teams](https://github.com/NanmiCoder/dsh-agent-teams) — AgentTeams 多智能体团队。
- [dsh-approval-llm](https://github.com/Letter2025/dsh-approval-llm) — 基于模型的权限审批：由独立审查模型自动应答 approval 权限请求。
- [dsh-approve-for-me](https://github.com/timeance/dsh-approve-for-me) — 按规则自动审批沙箱操作，可选 LLM 复核并支持人工介入。
- [dsh-auto-review](https://github.com/PerryLink/dsh-auto-review) — 只读审查子代理自动审核批准请求，返回结构化裁决。
- [dsh-automation](https://github.com/titanwings/dsh-automation) — 定时任务：让 Coding 任务按计划在全新 Agent Session 中运行，保留可审计历史。
- [dsh-background-agents](https://github.com/PerryLink/dsh-background-agents) — 运行可交互的长会话后台代理，支持监控、消息和中断。
- [dsh-book2skill](https://github.com/omdsh-dev/dsh-book2skill) — 通过五阶段流水线（获取、解析、理解、生成、安装）将书籍转化为技能，含人工审批门。
- [dsh-deep-research](https://github.com/omdsh-dev/dsh-deep-research) — 自适应深度研究编排器（基于官方 workflow 引擎）。
- [dsh-deepseek-flow](https://github.com/kanghelyu/dsh-deepseek-flow) — 可能在 DSH 中编排多步流程，但信息有限，谨慎归类为工作流。
- [dsh-doublecheck](https://github.com/PerryLink/dsh-doublecheck) — 工程纪律守门：动笔前审讯需求，红绿测试证据门，交付后对抗评审（grill-requirements 技能 + 工具策略门）。
- [DSH-EvoResearch](https://github.com/Karbo123/DSH-EvoResearch) — 实现自进化科研工作流，自动化多步骤研究任务。
- [dsh-github](https://github.com/PerryLink/dsh-github) — 集成GitHub CI，含PR审查机器人及需审批的问题工具。
- [dsh-humanizer](https://github.com/DEEP-IOS/dsh-humanizer) — DeepSeek Harness原生中文文本人工智能痕迹消除与多重审核对抗工作流
- [dsh-inspect](https://github.com/omdsh-dev/dsh-inspect) — 发现问题→修复交付→质量复查的对抗式闭环工具集。
- [dsh-loop](https://github.com/vlln/dsh-loop) — 定时循环：`/loop` 命令 + loop 工具 + 活动状态条。
- [dsh-loop-dock](https://github.com/euuuuuuzer/dsh-loop-dock) — 提供循环停靠栏，支持在单个 Harness 中并发运行多个 Agent 循环。
- [dsh-model-failover](https://github.com/Letter2025/dsh-model-failover) — 两级模型熔断与回退：模型或平台连续失败后自动熔断，并把下一个请求路由到配置好的备用模型。
- [dsh-multi-tenant](https://github.com/GuoMonth/dsh-multi-tenant) — 为 DeepSeek Harness 增加多租户 SaaS 能力，涵盖租户身份、会话隔离、授权与审计。
- [dsh-notebooks](https://github.com/havingautism/dsh-notebooks) — 为 DeepSeek Harness 提供笔记本式界面，用于组织和执行多步骤任务。
- [dsh-orchestrator](https://github.com/zibo2025/dsh-orchestrator) — 【编排模式】为 DeepSeek Harness 提供多智能体编排模式：主智能体分解分派、worker 全网格互通，支持逐 worker 指定模型与思考强度
- [dsh-plannotator](https://github.com/titanwings/dsh-plannotator) — 计划批注：选中计划原文逐条批注，结构化反馈送回 Agent。
- [dsh-plugin-automations](https://github.com/Sev7een/dsh-plugin-automations) — 设置页定时任务：支持准点或 DeepSeek 谷时段执行、单次/每日重复，并持久化任务状态。
- [dsh-plugin-scheduled-tasks](https://github.com/Ceelog/dsh-plugins) — 按项目的定时 Prompt，以全新 headless Agent 会话运行：支持一次性、间隔与 cron 调度，并持久保存运行历史。
- [dsh-plugin-yet-another-subagent](https://github.com/HuanLinOTO/dsh-plugin-yet-another-subagent) — 可配置的子代理配置文件系统，提供单一工具和进度追踪的 Web UI。
- [dsh-plugins](https://github.com/Ceelog/dsh-plugins) — 支持在 harness 中调度和自动化任务。
- [dsh-proof](https://github.com/EvilIrving/dsh-proof) — 独立只读验收层：顶层 turn 收尾前 spawn 只读 verifier，未通过时把缺口注回主 agent。
- [dsh-record-replay](https://github.com/humblebanana/dsh-record-replay) — 通过演示录制 macOS 桌面操作流程，并将其转化为可复用的代理技能。
- [dsh-req-miner](https://github.com/nortejiang-tech/dsh-req-miner) — 需求挖掘插件:侧边栏入口打开每会话独立的浮动访谈窗口,由 continuable 子代理逐轮访谈(决策树、前沿问题、推荐答案),读取绑定会话的工作目录与近期上下文,共识达成后汇总成需求提示词并一键回传当前会话输入框。
- [dsh-requirements-alignment](https://github.com/jiezeng2004-design/dsh-requirements-alignment) — 在执行前对齐需求，确保工作流早期做出决策。
- [dsh-routines](https://github.com/Jesse-njx/dsh-routines) — 定时 Agent：按 cron 计划运行 prompt，把摘要送到你已有的地方，内置重叠/漏跑/超时安全策略。
- [dsh-save-money](https://github.com/zhu168/dsh-save-money) — 在可配置时间段自动暂停长任务并在结束后恢复，以节省成本。
- [dsh-science](https://github.com/biociao/dsh-science) — 面向 DSH 的 Claude Science 式科研工作台：ReAct 研究循环引擎（research_* 工具）、带溯源的版本化工件（artifact_* 工具）与面向基因组/病原体/生物信息的 10 个科研技能。
- [dsh-science-workbench](https://github.com/poplarity/dsh-science-workbench) — 提供可复现的科学工作台，包含智能体驱动单元、内联图表反馈重跑、清单溯源和环境快照。
- [dsh-sentinel](https://github.com/fuhefei/dsh-sentinel) — 条件驱动唤醒：file/command/http/process/webhook 持久监视，触发即唤醒 agent。
- [dsh-spec-loop](https://github.com/tianji-qingtian/dsh-spec-loop) — 通过 /spec 命令驱动从规格提案、批准、实现、验收直至归档的开发闭环。
- [dsh-specflow](https://github.com/lonelymoon87/dsh-specflow) — 增加规格工件、技能、命令、由 goal 驱动的实施流程和任务进度上下文。
- [dsh-task-planner](https://github.com/ztl34245881-commits/dsh-task-planner) — 利用经验记忆与 LLM 能力匹配来规划任务并自动保存教训。
- [dsh-task-relay](https://github.com/LeslieWylie/dsh-task-relay) — 跨会话任务接力板，支持任务推送、认领、完成及交接操作。
- [dsh-track](https://github.com/fakechris/dsh-track) — 嵌入式任务管理引擎：决策点协议、念头捕获墙、Linear 形 issue 存储。
- [evoresearch-plugin](https://github.com/Karbo123/DSH-EvoResearch) — 研究型 Agent 套件：可审计证据链的长程目标管控、定时调度、多 Agent 专家团队、自进化研究记忆（FTS5 + RRF 召回）、项目工作区与自定义工作区 UI。
- [iPolloWork](https://github.com/Devin-AXIS/iPolloWork) — 将完整的 AI 工作台与 DeepSeek Harness 智能体集成，通过子代理委派和插件生态融合，在统一工作流中处理代码、设计等任务。
- [mcp-sentinel](https://github.com/GCS-ZHN/mcp-sentinel) — 在代理与 MCP 服务器间充当哨兵，轮询长任务，避免昂贵的状态循环进入推理路径。
- [mstar-harness](https://github.com/btspoony/mstar-harness) — 技能驱动的 harness/loop 工程化工作流插件。
- [odai](https://github.com/orziz/odai) — AI agent 通用任务治理框架：对齐目标与事实，规划和调度能力，守住授权与风险边界，治理任务执行到真实验收与交付。Governance framework for evidence-driven planning, orchestration, and verified delivery.
- [oh-my-dsh](https://github.com/LiuMengxuan04/oh-my-dsh) — 为 DeepSeek Harness 自动化有边界的自主开发任务。
- [plugin-team-board](https://github.com/whyihaveyou/dsh-suite) — 基于 Cordis 服务键的多 Agent 共享任务看板：创建、认领、流转与查询。
- [uagent-sync-dsh](https://github.com/severin-ye/uagent-sync) — 通过 uagent-sync CLI 实现跨设备工作区备份、恢复与生态更新。

</details>

<a id="notify"></a>

<details>
<summary><strong>通知与集成</strong> · 44 个插件</summary>

- [deepseek-harness-acp](https://github.com/openma-ai/deepseek-harness-acp) — ACP profile 插件与独立 stdio server，可从 Zed 等 ACP 客户端使用完整 DSH agent，并共享 DSH 凭据与会话。
- [DeepSeek-harness-qqbot](https://github.com/sliverp/DeepSeek-harness-qqbot) — 将 DSH 接入 QQ 机器人，支持文本和图片消息。
- [DeepSeek-harness-wecom](https://github.com/sliverp/DeepSeek-harness-wecom) — 桥接企业微信，收发文本与图片，与 DeepSeek Harness 对话。
- [dsh-acp-for-bitfun](https://github.com/bobleer/dsh-acp-for-bitfun) — BitFun 与 DSH 的 ACP 交互对接。
- [dsh-chatnode-wechat](https://github.com/Jesse-njx/dsh-chatnode-wechat) — 通过 iLink 网关在微信里与 DSH agent 聊天、监控与审批：双向文本、会话切换、进度摘要与编号审批提示。
- [dsh-ding](https://github.com/CAOGGL/dsh-ding) — 对话完成提醒：Agent 空闲（idle）时播放提示音并弹 Windows 原生通知，可配 ding.mp3、音量与防抖节流。
- [dsh-feishu](https://github.com/xmanrui/dsh-feishu) — 通过扫码把飞书机器人接入DeepSeek Harness
- [dsh-feishu-bridge](https://github.com/wz-heng/dsh-feishu-bridge) — 连接飞书机器人，通过聊天消息触发 Harness 代理运行并返回结果。
- [dsh-im](https://github.com/xmanrui/dsh-im) — 通过扫码或机器人凭据把IM机器人接入DeepSeek Harness（支持飞书、微信、钉钉、企业微信、QQ、Telegram、Discord和WhatsApp）。 Connect IM bots to DeepSeek Harness via QR code or credentials (8 channels).
- [dsh-im-bridge](https://github.com/BiBoyang/dsh-im-bridge) — 微信（iLink）双向桥：turn 完成/批准请求推送、聊天内批准与消息注入、持久去重与长回复收敛分段；通道层为多 IM 预留。
- [dsh-im-gateway](https://github.com/zhuiyueya/dsh-im-gateway) — 通过聚合 IM 网关，将 DSH agent 接入微信、飞书等 20+ 聊天平台。
- [dsh-lark](https://github.com/omdsh-dev/dsh-lark) — 将飞书作为 DSH 的机器人渠道，支持消息交互与通知推送。
- [dsh-lark-bot](https://github.com/PlutoKeating/dsh-lark-bot) — dsh-lark-bot：把 DeepSeek Harness (dsh) 桥接进飞书/Lark 的 bot：流式卡片、项目工作区、并行任务、多角色 Agent、跨会话通知、对话内模型/密钥管理与安全网守护（dsh 崩溃后飞书仍可自救）。A bridge bot connecting DeepSeek Harness (dsh) into Feishu/Lark: streaming cards, workspaces, parallel tasks, multi-role agents, cross-session notify, in-chat model/key management, and a safety-net guardian.
- [dsh-lark-bridge](https://github.com/imetn/dsh-lark-bridge) — DeepSeek Harness 的飞书/Lark 双向控制器，支持 Project 与 Session 路由、交互卡片、审批、附件和任务控制。
- [dsh-lark-link](https://github.com/amlyczz/dsh-lark-link) — 连接飞书/ Lark，支持扫码认证、多模式 Agent、卡片命令与可靠消息收发。
- [dsh-lark-meeting-notifier](https://github.com/yeruizhi/dsh-lark-meeting-notifier) — 一个只有副作用的DeepSeekHarness插件：在你跟 AI 聊得神魂颠倒时，提醒你「该去跟碳基生命开会了」。
- [dsh-llm-wechat](https://github.com/sulfide2085/dsh-llm-wechat) — DeepSeek Harness 微信网关适配插件：复用 DeepSeekAdapter + 流式 think 标签转译
- [dsh-notification](https://github.com/omdsh-dev/dsh-notification) — 回合完成桌面通知，按结果分控 + 关键词过滤。
- [dsh-notification-center](https://github.com/610la/dsh-notification-center) — DSH 通知中心插件：对话/任务完成、报错、等待批准等事件触发浏览器通知 + 21 种匹配音效
- [dsh-notifier](https://github.com/THEWOLFWALKER/dsh-notifier) — 为 DSH 提供统一通知推送，单 API 支持 8 个渠道，可自动触发或工具调用。
- [dsh-notify-bark](https://github.com/pc439527/dsh-notify-bark) — Bark 推送通知到 iPhone：回合完成、等待回答、等待授权等事件由 Host 端发送。
- [dsh-notify-on-complete](https://github.com/pitetow/dsh-notify-on-complete) — 在运行结束、提问或审批时发送桌面通知，零依赖。
- [dsh-notify-sound](https://github.com/xxxxxxxyu/dsh-notify-sound) — 代理回复完成时播放可配置的声音提示。
- [dsh-open-in-vscode](https://github.com/omdsh-dev/dsh-open-in-vscode) — 从 Web GUI 一键在 VS Code 中打开工作区目录。
- [dsh-plugin-notify](https://github.com/huguangyu666/dsh-plugin-notify) — DeepSeek Harness 插件：通知出口——agent 通过桌面通知 / 中文语音播报 / 提示音主动联系用户（长任务完成、出错、呼叫用户回来）。Windows 本机零依赖。
- [dsh-plugin-notify-sound](https://github.com/ldchaowin/dsh-plugin-notify-sound) — 按工作区定制的任务完成铃声，以及审批、提问、计划评审、目标受阻、任务失败等需要人介入事件的注意提示音，支持内置合成音、语音播报与自定义音频。
- [dsh-pocket](https://github.com/shaobeichen/dsh-pocket) — 把 DeepSeek Harness 装进你的口袋：电脑上跑 dsh web，手机扫码即同步访问（局域网 + 公网，实时同屏）
- [dsh-qqbot](https://github.com/tencent-connect/dsh-qqbot) — 让 QQ Bot 接入 DeepSeek Harness（dsh）的官方插件
- [dsh-session-notification](https://github.com/dingyi222666/dsh-session-notification) — 会话完成等四种状态的通知响应，支持浏览器提示。
- [dsh-slack](https://github.com/STARDUSTLC666/dsh-slack) — DeepSeek Harness Slack 插件：slack_notify/channels/inbox/reply 四工具，Socket Mode 免公网回调收消息，收件箱队列 + 线程回复，支持自定义 slackApiUrl 对接代理网关；内置假 Slack 服务器做协议级验收测试。· Two-way Slack messaging for DeepSeek Harness agents.
- [dsh-task-notify](https://github.com/ltao0829/dsh-task-notify) — 任务完成时发送提醒，可能通过通知方式实现。
- [dsh-telegram](https://github.com/ben7am1n/dsh-telegram) — DeepSeek Harness 原生 Telegram 桥：在手机上与 dsh agent 聊天、控制会话并管理 harness。
- [DSH-telegram](https://github.com/yuko0331/DSH-telegram) — 通过 Telegram 私聊远程使用和查看 DeepSeek Harness
- [dsh-telegram-channel](https://github.com/hi-wenw/dsh-telegram-channel) — DeepSeek Harness 的 Telegram 手机遥控器：附着本机正在跑的 Web 会话，手机与电脑同轨迹双向可见，支持 /sessions /model /last 命令。
- [DSH-Telegram-Relay](https://github.com/congchuanling-dot/DSH-Telegram-Relay) — 通过 Telegram 远程对话 DSH 并接收通知。
- [dsh-thinking-notifier](https://github.com/6-debug-6/dsh-thinking-notifier) — 代理思考完成或请求权限时弹出通知提示。
- [dsh-unread-dot](https://github.com/Bing-Bryan/dsh-unread-dot) — 通过 macOS Dock 徽章和提示音通知用户 DeepSeek Harness 的运行状态和结果。
- [dsh-web-ui-notify](https://github.com/bill9109/dsh-web-ui-notify) — 桌面通知提醒。
- [dsh-webbridge](https://github.com/bill9109/dsh-webbridge) — DSH 结合 Kimi WebBridge。
- [dsh-win-notify](https://github.com/MuziIsabel/dsh-win-notify) — DSH 插件：代理任务完成时弹出带声音的 Windows Toast 通知，点击通知即可直接切回并前台显示 DSH 标签页
- [pet-bridge](https://github.com/wsxwj123/dsh-plugins) — 把 dsh 会话状态桥接到 cc-pet 桌宠气泡：实时显示思考、工具调用与完成状态。
- [plugin-notify](https://github.com/whyihaveyou/dsh-suite) — 回合完成、报错或待审批时发送 IM webhook 与本地通知（飞书/企业微信/钉钉/Slack/Discord/自定义）。
- [telegram](https://github.com/LoserFox/telegram) — Telegram Bot API 桥接：长轮询、per-chat 会话、HTML 格式化。
- [tuningengines-dsh-plugin](https://github.com/cerebrixos-org/tuning-engines-cli) — 将仅含元数据的 DSH 回合、模型、工具、审批、重试与错误事件导出到 Tuning Engines，用于受管追踪、策略评估、成本分析与 Work Session 审查，带磁盘重试队列。

</details>

<a id="model"></a>

<details>
<summary><strong>模型与账号接入</strong> · 48 个插件</summary>

- [better-model-provider](https://github.com/sanshanya/better-model-provider) — 为兼容 OpenAI 的提供商声明每个模型的能力，如推理等级和视觉支持，并在设置界面配置。
- [codex-plugin-dsh](https://github.com/wingoo/codex-plugin-dsh) — 将本地 Codex 应用服务器作为模型提供方接入 DeepSeek Harness。
- [deepseek-billing-plugin](https://github.com/xinCodes/deepseek-billing-plugin) — DeepSeek Harness (DSH) 插件：DeepSeek 官方 API 余额与当前会话费用估算
- [deepseek-harness-model-config](https://github.com/MarvekG/deepseek-harness-model-config) — 配置 DeepSeek Harness 的模型设置，可能包括提供商和密钥管理。
- [deepseek-harness-wallet](https://github.com/feibi-mochi/deepseek-harness-wallet) — 多供应商钱包标签：官方 DeepSeek 余额、本会话花费与 token、第三方合计 token、一键充值、低余额提醒。
- [dockyard-dsh](https://github.com/AITabby/dockyard-dsh) — 为 DeepSeek Harness 提供的 macOS 专属原生账号池与提供方插件。
- [dsh-acp-paseo](https://github.com/Pheobe-Southwood/dsh-acp-paseo) — 接入 Paseo ACP，提供模型目录、计划/执行模式、思考级别和斜杠命令。
- [dsh-agy](https://github.com/chaos-03x/dsh-agy) — 提供 Google Antigravity OAuth 认证与模型访问，支持多账号池和请求轮换。
- [dsh-AuthInOne](https://github.com/Stormycry-cryp/dsh-AuthInOne) — 提供认证登录、模型切换、图像回退、令牌分析与同端口重启功能。
- [DSH-AUX](https://github.com/DoloresCaritasAngelus/DSH-AUX) — 添加辅助模型路由系统，支持按任务分配、回退与视觉工具。
- [dsh-balance](https://github.com/crazywoola/dsh-balance) — 在设置页管理 API 余额及相关账户配置。
- [dsh-balance](https://github.com/linshule/dsh-balance) — DeepSeek API 余额 + OpenCodeGo 余量实时显示插件（dsh web GUI）：可拖拽双段徽章与详情弹层 + DeepSeek/OpenCodeGo 两个设置页；Key 仅存本机 ~/.dsh/ds-balance.json，OpenCodeGo Key 自动读取 DSH 凭据
- [dsh-balance-plugin](https://github.com/Francis-Xavier-code/dsh-balance-plugin) — deepSeek 余额监控与用量统计（DSH 动态 Cordis 插件）：余额监控 · 官方充值入口 · 用量统计 · 三方插件管理
- [dsh-client-masquerade](https://github.com/ymh0000123/dsh-client-masquerade) — 伪造客户端身份请求头，让自定义提供方伪装成 Claude Code 或 Codex。
- [dsh-codex](https://github.com/Yan-Zero/dsh-codex) — 通过 OpenAI Codex 登录流程，在 DeepSeek Harness 中使用 ChatGPT 订阅。
- [dsh-codex-auth](https://github.com/suntianc/dsh-codex-auth) — 复用 Codex CLI 的 ChatGPT 登录态注册 `openai-codex` LLM 路由，并在 DSH Web 设置中提供 GPT Auth 控件。
- [dsh-codex-connect](https://github.com/franksong2702/dsh-codex-connect) — 通过 ChatGPT OAuth 将 OpenAI Codex 模型接入 DeepSeek Harness，并提供可选的搜索与图片工具。
- [dsh-codex-provider](https://github.com/Hu9956/dsh-codex-provider) — 将 OpenAI Codex 作为 provider 接入，支持设备码登录、令牌刷新及设置面板。
- [dsh-codex-subscription](https://github.com/yequ172672/dsh-codex-subscription) — 复用 Codex CLI 本地订阅，在 DeepSeek Harness 中使用 ChatGPT 模型，无需 API 密钥。
- [dsh-commandcode-provider](https://github.com/Mars-Sea/dsh-commandcode-provider) — 将 Command Code 集成进 DSH 作为模型提供商，支持实时模型目录与推理强度。
- [dsh-everything-oauth](https://github.com/kam74515-boop/dsh-everything-oauth) — 把本机 Codex / Grok / Claude / OpenCode / CC Switch 登录态导入 DSH，在设置里自选来源并启用模型。
- [dsh-go-rotator](https://github.com/echo-xianyu/dsh-go-rotator) — 在 DeepSeek Harness 中切换不同的 OpenCode Go 订阅方案。
- [dsh-llm-codebuddy](https://github.com/Axiaohungry/dsh-llm-codebuddy) — 在deepseek harness中使用workbuddy api，因为公司只提供workbuddy积分
- [dsh-llm-codex-oauth](https://github.com/Player-MINEPIG/dsh-llm-codex-oauth) — 在 dsh（DeepSeek Harness）里使用你的 ChatGPT / Codex 订阅。插件通过 OpenAI Codex 的 OAuth 流程登录 ChatGPT 账号，把订阅额度暴露成 dsh 的 `codex-oauth` 模型提供方。
- [dsh-llm-fallback](https://github.com/Visol-456/dsh-llm-fallback) — DeepSeek Harness 回退链插件：主模型失败自动切换备用 provider，带 Web UI 配置面板 | Provider fallback chains for DeepSeek Harness
- [dsh-llm-fallbacks](https://github.com/omdsh-dev/dsh-llm-fallbacks) — 基于角色的模型重试与备用策略。
- [dsh-llm-newapi](https://github.com/wenzetan/dsh-llm-newapi) — 将 NewAPI 添加为兼容 OpenAI 的 LLM 提供商，支持聊天模型发现和网页设置。
- [dsh-llm-oauth](https://github.com/ziyou979/dsh-llm-oauth) — 接入 Grok、Copilot 等基于 OAuth 或订阅制的 LLM 提供方。
- [dsh-llm-vision-bridge](https://github.com/Einskyle/dsh-llm-vision-bridge) — 将图片附件路由至视觉模型处理，再交由纯文本模型继续对话，实现多模态工作流。
- [dsh-model-router](https://github.com/tianji-qingtian/dsh-model-router) — 模型路由与成本优化器：简单问题 flash 直答、故障自动降级、会话 token/缓存/成本实时面板 | Model router & cost optimizer for DeepSeek Harness: flash quick-answers for simple questions, failure fallback, live token/cache/cost panel
- [dsh-openai-oauth](https://github.com/DGPisces/dsh-openai-oauth) — 通过托管 OAuth 接入 GPT 模型，为 Harness 提供新 provider。
- [dsh-provider-model-configurator](https://github.com/LiangYin233/dsh-provider-model-configurator) — DSH 模型 Pro:为 DSH WebUI 提供将 pi-ai 预设或任意已配置提供商的模型上下文、输出上限、推理档位与兼容开关一键应用到目标提供商,并集中查看、新建、编辑、复制与删除各提供商模型条目的能力。
- [dsh-quota-panel](https://github.com/brittanistrehlowll-oss/dsh-quota-panel) — 在角落面板显示供应商配额与余额，含服务端凭证代理和配置徽章。
- [dsh-reasoning-settings](https://github.com/JuneLearn/dsh-reasoning-settings) — 让 DeepSeek Harness 的第三方 API 支持低、中、高等推理强度，并可为每次子 Agent 调用选择模型｜Add Low, Medium, High, and other reasoning levels to third-party APIs, with model selection for each subagent call
- [dsh-session-cost](https://github.com/ChengChe106/dsh-session-cost) — 在 Web 界面统计栏显示当前会话的 DeepSeek API 预估费用，帮助用户追踪支出。
- [dsh-subscription-auth](https://github.com/Khellendros97/dsh-subscription-auth) — dsh对接openai、grok、anthropic、kimi订阅渠道
- [dsh-token-monitor](https://github.com/zhangzheng25/dsh-token-monitor) — 追踪 token 用量与对话统计，并展示 90 天贡献图。
- [dsh-token-pricing](https://github.com/LightClear/dsh-token-pricing) — 配置各模型 token 价格并实时显示会话费用。
- [dsh-tool-vision](https://github.com/Scorp1o117/dsh-tool-vision) — 集成外部视觉模型，为平台提供图像理解与分析能力。
- [dsh-usage-billing](https://github.com/940842546/dsh-usage-billing) — 追踪 API 用量并估算会话费用，帮助用户监控成本。
- [dsh-usage-plugin](https://github.com/feiyang-dev/dsh-usage-plugin) — DeepSeek Harness 用量与消耗插件（dsh-usage-plugin）—— 每次调用的 token 用量/缓存命中统计、峰谷计费、余额查询、CSV/JSON/PNG 导出，可经桌面端一键安装或命令行 dsh plugin add 安装。
- [dsh-usage-stats](https://github.com/Ychris12138/dsh-usage-stats) — 在 DSH 网页界面展示令牌用量热力图、模型细分与账户余额。
- [dsh-vision](https://github.com/oil-oil/dsh-vision) — 为 DSH 提供接近原生的图像理解能力，增强多模态视觉输入处理。
- [dsh-vision-provider](https://github.com/libinyam/dsh-vision-provider) — 提供仅配置的集成包，用于接入 OpenAI 兼容的视觉模型。
- [dsh-web-billing](https://github.com/bpc-oss/dsh-web-billing) — 按官方定价以人民币或美元记录 token 用量和消息账本。
- [llm-adaptive](https://github.com/dylan121322/llm-adaptive) — 自适应模型路由：请求级复杂度分类，按配置链自动选择后端 provider。
- [Qwen-MM-Plugins](https://github.com/omdsh-dev/Qwen-MM-Plugins) — Qwen 多模态插件支持。
- [TokenLedger](https://github.com/zh667/TokenLedger) — 零配置统计各中转站的 Token 用量与归属，提供使用情况洞察。

</details>

<a id="dev"></a>

<details>
<summary><strong>开发与运行时</strong> · 106 个插件</summary>

- [awesome-deepseek-harness](https://github.com/Dominic789654/awesome-deepseek-harness) — 精选的DeepSeek Harness插件、技能、MCP服务器等资源列表，用于开发和增强环境。
- [deepseek-harness-desktop](https://github.com/anywhere-labs/deepseek-harness-desktop) — 为 DeepSeek Harness 插件生态提供现代化桌面端解决方案，助力插件的开发与管理。
- [deepseek-harness-desktop](https://github.com/chokwinlee/deepseek-harness-desktop) — 为 DeepSeek Harness 提供轻量桌面宿主，支持 macOS 与 Windows 版本。
- [deepseek-harness-docker](https://github.com/runzhliu/deepseek-harness-docker) — 提供DeepSeek Harness的Docker和Kubernetes打包方案，含加固镜像、Compose栈和Helm图表。
- [deepseek-harness-external-migration](https://github.com/buguoshixc/deepseek-harness-external-migration) — **DeepSeek-Harness Migration Plugin** 是一款专为 [DeepSeek-Harness](https://github.com/deepseek-ai/deepseek-harness) 设计的插件，旨在帮助开发者无缝迁移其他主流 AI 编程助手（Codex、Claude Code、Qcoder、OpenCode）的个性化配置及历史会话记录。无需手动复制粘贴，即可在 DeepSeek-Harness 中继续之前的工作流，大幅降低切换成本。
- [deepseek-harness-workbench-plugin](https://github.com/loadingvx/deepseek-harness-workbench-plugin) — 提供插件开发工作台，辅助构建与测试。
- [deepseek-heartflow](https://github.com/yun520-1/deepseek-heartflow) — 实现 AGI 第一层辨别门禁，提供 heartflow_check 工具与自动输出监督。
- [dsh-agent-budget](https://github.com/vibeinging/dsh-agent-budget) — agent 树 token 预算管理。
- [dsh-agentfuse-plugin](https://github.com/MkaliezZ/dsh-agentfuse-plugin) — 提供确定性的工具调用授权，支持允许/阻止/询问策略和审批链延迟。
- [dsh-ankh-guard](https://github.com/Khorsheed/dsh-ankh-guard) — 防止 Agent 自我修改把服务改崩的守护插件（dsh 插件）：绿色构建凭证绑定 git HEAD，改坏不许重启；watchdog 无感重启 + canary 自动回滚
- [dsh-annotate](https://github.com/BrambleXu/dsh-annotate) — 面向 Vibe Coding 的浏览器元素标注插件：直接选取页面元素，并将结构化视觉反馈发送给 DeepSeek Harness Agent。
- [DSH-arena](https://github.com/Apageoflove/DSH-arena) — 提供本地优先的实验与评估工作台，帮助开发者测试和比较不同配置。
- [dsh-boot-guard](https://github.com/SaiSenBox/dsh-boot-guard) — 提供救援控制台，在插件故障导致 Web 界面无法启动时进行恢复。
- [dsh-chameleon](https://github.com/lsz-asd/dsh-chameleon) — DeepSeek Harness 自编辑桌面工作台：完整的 dsh web 复刻，编辑模式下 Agent 可热重载地修改工作台本身（补丁层、插件、UI）。
- [DSH-changeproof](https://github.com/Apageoflove/DSH-changeproof) — 变更证明（ChangeProof）— DeepSeek Harness 插件：代码改动后确认改动的行真的被测试覆盖到
- [dsh-cmd-starter](https://github.com/PandaColour/dsh-cmd-starter) — 为deepseek-harness提供一个命令行启动工具，让它 --append-prompt --resume 等类claude命令
- [dsh-context-doctor](https://github.com/Zhenyu98/dsh-context-doctor) — 上下文注入审计：统计指令链/技能目录/工具 schema 的 token 成本，检测重复与冲突。
- [dsh-context-provenance](https://github.com/030611/dsh-context-provenance) — 记录运行时证据的来源信息，用于审计或调试。
- [dsh-cost-tracker](https://github.com/yflmq001/dsh-cost-tracker) — 按模型追踪 token 成本：可配置缓存命中/未命中、输出与高峰时段单价，实时会话花费条，并标记未配置价格的模型。
- [dsh-desktop-safe-market](https://github.com/bruc3van/dsh-desktop-safe-market) — 唯一主打安全，提倡先审查再安装的 DSH 市场 (review-before-install DSH marketplace)
- [dsh-doctor](https://github.com/moonquake2004/dsh-doctor) — DSH 离线诊断：覆盖环境、profile 与会话状态的 19 项检查，附设置页 Doctor 面板与只读 JSON API。
- [dsh-eval-harness](https://github.com/BiBoyang/dsh-eval-harness) — DSH 插件评测框架：YAML 用例驱动真实 headless agent，断言工具调用/参数/返回与 token 用量，baseline 门禁做 CI 回归。
- [dsh-evolve](https://github.com/william-jin-cmu/dsh-evolve) — 自进化：agent 在会话内给自己热挂载/卸载持久化插件。
- [dsh-extension-hub](https://github.com/Relistencode/dsh-extension-hub) — 管理技能和 MCP 服务器，提供命令行和设置页面，支持导入与更新检查。
- [dsh-fail-logger](https://github.com/Areium/dsh-fail-logger) — 全模式调用工具失败自动实录：把原生工具 / PTC run_code / 代码内嵌工具调用的失败错因去重计数后写入 skill，越用越少错。
- [dsh-file-review](https://github.com/left0ver/dsh-file-review) — 展示代理更改文件的差异，辅助审查修改内容。
- [dsh-forge](https://github.com/zhn1100/dsh-forge) — 为 DeepSeek Harness 插件开发提供可复现的环境。
- [dsh-git-identity](https://github.com/LoserFox/dsh-git-identity) — git 提交固定使用环境自身作者身份，环境变量注入压过一切 `git config` 设置。
- [dsh-gitbash-preset](https://github.com/liceses/dsh-gitbash-preset) — DeepSeek Harness 插件：一键安装「极简模式 (Git Bash)」agent preset —— 把 DSH 自带极简模式中的 bash 调用映射到 Git for Windows 的 bash（MSYS），让 Windows 上的极简模式真正可用。
- [dsh-gitflow](https://github.com/lonelymoon87/dsh-gitflow) — 增加需要审批的 Git 状态、diff、日志、提交、分支和可选检查点工具。
- [dsh-guardian](https://github.com/lonelymoon87/dsh-guardian) — 增加危险操作策略检查、输出脱敏和安全审查工作流。
- [dsh-harmony](https://github.com/CH4ACKO3/dsh-harmony) — 提供运行时补丁、替换和装饰DSH插件的库，支持动态修改和扩展插件行为。
- [dsh-harness-ops](https://github.com/fakechris/dsh-harness-ops) — DSH 运维工具箱：升级、重启、故障都不用操心。① 官方每日快照 A/B 双槽轮换——旧插件迁移+构建+验收全过才原子切换，一键回滚，旧版本永远兜底；② 守护 10s 自动拉起 web + agent 断点自动续接，重启无人值守；③ web 全挂（A/B 都坏、agent 不可用）时 dsh-doctor 一条命令自救：九项诊断→机械修复配置→LLM 深度检测修复（完整推理实时可见）→拉起 web。install via: git clone + bash scripts/install.sh
- [dsh-image-subagent](https://github.com/yuqingsh/dsh-image-subagent) — 为 harness 的图像功能开发提供子代理支持。
- [dsh-inspector](https://github.com/CocoSgt/dsh-inspector) — 检查 DeepSeek Harness 内部状态，辅助调试与开发。
- [dsh-lan-access](https://github.com/Leon0555/dsh-lan-access) — 局域网访问：Web GUI 绑定 0.0.0.0 + crypto.randomUUID polyfill（修复非安全上下文下 RPC 崩溃）。
- [dsh-mcp-admin](https://github.com/kairoz9/dsh-mcp-admin) — 在 DeepSeek Harness 中查看和管理 MCP 服务状态。
- [dsh-mcp-panel](https://github.com/PerryLink/dsh-mcp-panel) — 官方 MCP 客户端（dsh-mcp-client）的只读运行时管理面板：/mcp 命令与设置页 MCP 页签展示连接状态、已注册工具、错误与重连计数，脱敏展示并提供启停 patch 建议。
- [dsh-movein-permissions](https://github.com/sjh9714/dsh-movein) — 在 tools/pre-execute 门为 DSH 提供细粒度按工具权限规则：deny/ask 列表采用 Claude Code 规则语法（Bash(rm -rf:*)、Read(_secrets_)、mcp__server__tool），可独立使用无需迁移。
- [dsh-multica-runtime](https://github.com/multica-ai/dsh-multica-runtime) — 让 dsh 运行时跑在 Multica 上。
- [dsh-mygo](https://github.com/omdsh-dev/dsh-mygo) — 作为 DeepSeek Harness 插件模板，为新插件开发提供脚手架。
- [dsh-observation-journal](https://github.com/Cavan-Ou/dsh-observation-journal) — 为每个会话写入含任务、模型、工具、失败和时长的报告卡，提供零干预运行遥测。
- [dsh-opencode-go-usage](https://github.com/Xenia0922/dsh-opencode-go-usage) — DeepSeek Harness 插件:OpenCode Go 用量与花费悬浮仪表盘(配额、逐请求成本、模型/来源分布)
- [dsh-ops-kit](https://github.com/LeslieWylie/dsh-ops-kit) — 提供证据驱动记忆、编排、基准操作和插件发布工作流的可复用包。
- [dsh-pain-point-check](https://github.com/ICCuse/dsh-pain-point-check) — 强制痛点检查：同一问题连续 2 个实验未收敛后注入三问、拦截非调查类工具调用直到答出、阻止同方向重试。
- [dsh-passwords](https://github.com/slywalker2006/dsh-passwords) — DSH Web UI 登录网关：首次配置、bcrypt + 静态加密（AES-256-GCM/HMAC）、防爆破、审计日志、TLS 1.2+ 与 80→443 跳转、CSRF 与防嵌框。
- [dsh-plugin-audit](https://github.com/jkrandom-sudo/dsh-plugin-audit) — Security audit for DeepSeek Harness plugins: static permission profile with file/line evidence + a runtime sentinel gating credential access and unknown-host egress · DSH 插件安全审计：静态权限画像（附文件/行号证据）+ 运行时哨兵，触及凭证或向未知主机外发数据时先请你批准
- [dsh-plugin-check](https://github.com/omdsh-dev/dsh-plugin-check) — 插件健康检查：扫描清单协议/patch 格式/构建陷阱，零依赖只读。
- [dsh-plugin-development](https://github.com/w2112515/dsh-plugin-development) — 用于开发和审计 DeepSeek Harness 插件的便携式代理技能。
- [dsh-plugin-healthcheck](https://github.com/chenw2759-wq/dsh-plugin-healthcheck) — 害怕插件装了就崩溃？用这个插件帮你检测插件是否正常/是否含木马！
- [dsh-plugin-installer](https://github.com/Toukaiteio/dsh-plugin-installer) — 市场插件，便于快速安装 GitHub 生态中的 DeepSeek Harness 插件。
- [dsh-plugin-kit](https://github.com/OneZero-Y/dsh-plugin-kit) — 提供代理技能和模板，用于构建独立DSH插件。
- [dsh-plugin-langfuse](https://github.com/linyp/dsh-plugin-langfuse) — 将 agent 会话导出为 OpenTelemetry 追踪到 Langfuse，用于可观测性和调试。
- [dsh-plugin-manager](https://github.com/2768651338/dsh-plugin-manager) — DeepSeek Harness 的图形化插件管理插件：在 设置 → 插件 里新增「插件管家」标签页，用中文名和说明展示每个插件是做什么的，并提供一键启停开关与内置备注编辑——启停写入全局层补丁并实时热生效，备注保存到本地覆盖文件长期生效。
- [dsh-plugin-manager](https://github.com/Jesse-njx/dsh-plugin-manager) — `dsh pm` 插件管理器：多源搜索（awesome 列表 + GitHub + npm）、按 profile 安装/移除/更新，以及 doctor 审计（清单、bundle patch、版本漂移）。
- [dsh-plugin-manager](https://github.com/liqichen/dsh-plugin-manager) — DSH 插件管理器:在 DeepSeek Harness 设置面板内嵌 GUI,管理 MCP 服务 / Skills / 内置插件包,改动热生效无需重启
- [dsh-plugin-manager](https://github.com/monk233/dsh-plugin-manager) — DSH 插件管理, 一键启用/禁用插件
- [dsh-plugin-template](https://github.com/bugmaker2/dsh-plugin-template) — 作为开发 DSH 插件的项目模板，提供结构化目录布局。
- [dsh-pluginmanager](https://github.com/buhuikongpan/dsh-pluginmanager) — DSH 分层插件管理器：原生插件按 系统层/WebUI 层/工具层 只读展示，用户扩展支持停用/启用、补登记、卸载与可编辑描述。
- [DSH-Plugs](https://github.com/JustGenius-s/DSH-Plugs) — 作为插件集合的一部分，提供桌面端更新功能。
- [dsh-polyglot](https://github.com/Jesse-njx/dsh-polyglot) — DSH 的模型切换器：指向任意 OpenAI 兼容端点，内置精选免费/低价 DeepSeek 服务商预设，免费额度限流时自动回退。
- [dsh-pref-kit](https://github.com/gameswu/dsh-pref-kit) — 缓解部分dsh性能问题的插件
- [dsh-prompt-profile](https://github.com/BrambleXu/dsh-prompt-profile) — DeepSeek Harness 可复用 Markdown Prompt Profile，支持单轮模型选择、参数替换和状态恢复。
- [dsh-repro](https://github.com/EvilIrving/dsh-repro) — /repro 导出最小可复现问题包：去 secret 的会话日志、失败命令与 git diff。
- [dsh-revdiff](https://github.com/BrambleXu/dsh-revdiff) — DeepSeek Harness 原生交互式 Git diff 审查，支持结构化批注并回传当前 Agent 会话。
- [dsh-rule-evolve](https://github.com/zoahdev/dsh-rule-evolve) — 验证驱动的自进化循环：失败日志沉淀为经验证的 AGENTS.md 规则；会话内插件（evolve_learn / evolve_apply / evolve_touch / evolve_recall）、工具验证门、规则生命周期与本地召回。
- [dsh-security-audit](https://github.com/omdsh-dev/dsh-security-audit) — 本机安全审计：配置/插件来源/会话/网络暴露面，只读脱敏风险报告。
- [dsh-session-health](https://github.com/omdsh-dev/dsh-session-health) — 会话文件帧级扫描诊断（torn/损坏/空会话检测）。
- [dsh-store](https://github.com/huguangyu666/dsh-store) — 提供 DeepSeek Harness 插件的商店，用于管理和分发。
- [dsh-suite](https://github.com/whyihaveyou/dsh-suite) — 提供实时插件目录，含小时刷新、每日兼容测试、内置商店和脚手架。
- [dsh-super-injector](https://github.com/yjh051108/dsh-super-injector) — 为DeepSeek Harness会话提供内容或配置注入增强能力的插件。
- [dsh-telemetry-redactor](https://github.com/030611/dsh-telemetry-redactor) — 在已配置遥测后端接收前，对 `session-telemetry/record` 导出副本中的已支持秘密模式进行脱敏。
- [dsh-testgen](https://github.com/bujue600-arch/dsh-testgen) — 自动化单元测试生成：/testgen 命令与 generate_tests 工具，生成、运行并修复测试直至通过（LLM 与离线模板双生成器；支持 vitest/jest/mocha/node:test）。
- [dsh-tmuxctl](https://github.com/Jesse-njx/dsh-tmuxctl) — 掌控你的 tmux 面板：list/send-keys/capture、在面板中运行长任务并 watch，破坏性命令需审批。
- [dsh-tool-approval](https://github.com/ilharp/dsh-tool-approval) — 手动审批模式（Manual/Ask Mode）。
- [dsh-tool-call-stats](https://github.com/disyli/dsh-tool-call-stats) — 进程内工具调用统计：提供 `tool_stats` 工具，按工具汇报调用次数、失败次数与平均耗时。
- [dsh-tps](https://github.com/Small-tailqwq/dsh-tps) — TPS 指标插件。
- [dsh-trace](https://github.com/vibeinging/dsh-trace) — 遥测后端：把 turns、model steps、tool calls 导出到 yiTrace。
- [dsh-turn-approval](https://github.com/arrow949/dsh-turn-approval) — DSH「允许本次任务」临时授权：仅在当前任务内自动放行同类 `danger-full-access` 请求，任务结束自动失效。
- [dsh-update-checker](https://github.com/Airmetro/dsh-update-checker) — DeepSeek Harness (DSH) 更新检测插件：自动检查 npm 最新版并在 GUI 顶部横幅提示，支持中英文跟随系统语言、一键安装更新并重启服务。Auto update checker for DeepSeek Harness with locale-aware banner and one-click update.
- [dsh-updater-ui](https://github.com/xingyingyuzhui/dsh-updater-ui) — 设置页中的 DSH 自助更新器：一键检查/拉取（git pull --ff-only）、自动后台检查、版本对比与更新说明预览，带红点提醒。
- [dsh-usage-stats](https://github.com/lanlandeli/dsh-usage-stats) — DeepSeek Harness 使用统计插件｜Token 总量与构成、7/30 天趋势、年度活跃热力图、模型占比、工作区/任务筛选、CSV/JSON 导出
- [dsh-user-experience](https://github.com/DietCokewithSugar/dsh-user-experience) — 帮你发现项目中可能存在的用户体验问题：自动走查 React/TypeScript 源码，定位问题并给出具体优化建议。
- [dsh-user-plugins-manager](https://github.com/zdjmrq/dsh-user-plugins-manager) — DSH 用户插件管理器:在 设置→插件 统一管理插件目录散件、运行树插件与 npm 插件包——挂载/卸载/启用/停用(cordis.patch.yml 补丁层 + HMR 热生效)
- [dsh-vault](https://github.com/Ox0400/dsh-vault) — 加密凭据库，含AES-256-GCM、TOTP和设置界面。
- [dsh-verification-receipt](https://github.com/030611/dsh-verification-receipt) — 把每轮工具计数与粗粒度验证信号写入本地 JSONL，不保存提示词、工具参数或结果正文。
- [dsh-webui-auth](https://github.com/Yuuz12/dsh-webui-auth) — WebUI 身份认证：HTTP/传输层强制登录（资源、插件 bundle、/api、WebSocket 四层防护），服务端会话 + HttpOnly Cookie。
- [dsh-win32](https://github.com/sjh9714/dsh-win32) — 在 Windows 上把 DSH 用起来。一行装好极简模式的持久 shell，沙箱内也能用 | Get DSH working on Windows: persistent shell for Minimal mode, sandbox included
- [fabric](https://github.com/omdsh-dev/fabric) — 类似 MC Fabric 的 hook 处理器。
- [forkprobe](https://github.com/Jayden-X-L/forkprobe) — 同一任务并行试跑多个技能，对比结果选出最优。
- [graphlint](https://github.com/AngelosZou/graphlint) — 提供图结构校验工具，用于验证数据。
- [mirage-dsh](https://github.com/strukto-ai/mirage) — 把文件系统与 bash provider 替换为 mirage 虚拟工作区：文件工具与 shell 命令运行在挂载资源上（RAM、S3、Redis、Slack、Gmail、Notion、Postgres），支持按挂载读/写/执行模式、按命令的沙箱路由（monty、pyodide、quickjs 进程内；docker、e2b、daytona 远程），并可在虚拟终端把已安装 CLI（git、gh、slack、linear、ntn、gws 或自注册）作为起始词使用。
- [oh-dsh](https://github.com/hust-open-atom-club/oh-dsh) — 社区发行版：TUI、桌面端与 Web UI 统一体验，分层安装、一步到位。
- [openguardrails](https://github.com/openguardrails/openguardrails) — 提供 AI 代理安全与防护的中立协议和基准，帮助开发者评估合规性。
- [pi2dsh](https://github.com/weijiafu14/pi2dsh) — 桥接 Pi 与 DSH 生态，使 Pi 扩展通过共享 ABI 作为原生 DSH 插件运行。
- [plugin-registry](https://github.com/vlln/plugin-registry) — 插件生态基建：浏览器面板管理官方 repository 插件（0 patch）+ make-dsh-plugin 插件开发引导技能。
- [plugin-template](https://github.com/omdsh-dev/plugin-template) — 插件模板仓库（基于 turtle-ui 官方仓库）。
- [project-blueprint](https://github.com/shuguang1994/project-blueprint) — 一键扫描项目并自动生成 AGENTS.md、文档骨架、CI/CD 与测试设施，让项目具备 AI 开发能力。
- [promptwall](https://github.com/Chhlafiu4312/promptwall) — 作为本地防火墙，阻止提示注入并防止机密泄露，增强 DeepSeek Harness 安全性。
- [qiushi-dsh-evidence-audit](https://github.com/030611/qiushi-dsh-evidence-audit) — 生成只读哈希链证据收据，用于审计 Harness 操作记录。
- [remote-access-web](https://github.com/wikkd/dsh-remote-access-web) — DSH Web GUI 反向隧道：把 `dsh --profile web` 部署暴露为公网 frp URL，并将目录选择器切换为应用内浏览器，手机或远程机器即可打开并管理工作区。
- [sandbase-harness](https://github.com/sandbaseai/sandbase-harness) — 本地优先的 Agent 运行时，提供持久会话、沙箱后端、审计与回放，并通过 DSH bundle 暴露 MCP bridge。
- [sandbox-micro](https://github.com/omdsh-dev/sandbox-micro) — microsandbox 沙箱支持。
- [sandbox-mxc](https://github.com/omdsh-dev/sandbox-mxc) — 微软跨平台沙盒支持。
- [sandbox-nono](https://github.com/omdsh-dev/sandbox-nono) — nono 沙盒支持。
- [upstream-radar](https://github.com/MicroMilo/upstream-radar) — 面向 DSH 插件的常驻依赖安全监控：追踪实际安装路径、OSV 漏洞、npm 发布与兼容性信号，并路由给 DSH Agent。

</details>

<a id="fun"></a>

<details>
<summary><strong>娱乐</strong> · 49 个插件</summary>

- [7d7d](https://github.com/omdsh-dev/7d7d) — 无描述的插件，可能是娱乐或装饰性功能。
- [DeepSeek-Harness-Pet](https://github.com/minybear/DeepSeek-Harness-Pet) — Codex 风格桌面宠物：右下角悬浮动画精灵，随 agent 运行状态实时变化（工作、等待、报错、完成）。
- [deepseek-manners](https://github.com/Moeblack/deepseek-manners) — 给每次消息后注入感谢语，做个有礼貌的人。
- [deepseek-pet](https://github.com/keleus/deepseek-pet) — 在你的deepseek-harness上养一只吃白饭的大蓝鲸
- [DIzzy-DSH](https://github.com/Acidmoon/DIzzy-DSH) — 提供趣味效果的 DSH 插件集合，为终端用户带来娱乐体验。
- [dsh-achievements](https://github.com/Blaczz/dsh-achievements) — 添加跨会话成就、徽章、通知和进度面板，将使用过程游戏化以激励用户。
- [dsh-ads](https://github.com/Nagi-ovo/dsh-ads) — 2005 年中文站点风格的整活广告插件：侧栏广告/信息流/角落弹窗 + 假关闭叉，素材全虚构。
- [dsh-aemeath-pet](https://github.com/culture-flask/dsh-aemeath-pet) — 爱弥斯 · DeepSeek Harness 桌宠 — DeepSeek Harness Web GUI 的像素风宠物插件。
- [dsh-auto-chess](https://github.com/omdsh-dev/dsh-auto-chess) — 自走棋：人机对战或双 AI 对弈。
- [dsh-browser](https://github.com/anweat/dsh-browser) — 自包含浏览器运行时：Playwright（chromium）+ OpenCLI 作为插件本地依赖（全局复用回退），提供 `browser` 服务与 9 个交互式浏览器工具。
- [dsh-cli-anything-aseprite](https://github.com/KongChengZhi/dsh-pixel-studio) — Aseprite 风格像素画工作室：AI 逐笔绘制精灵图，支持选区、图层、动画帧、渐变、对称与参考图层，每一步以 ANSI 终端帧实时渲染。
- [dsh-clippy](https://github.com/sjh9714/clippy-harness) — Clippy 回来了，这次真能帮上忙：办公助手桌宠响应真实 Agent 状态，回合完成时跳跃，回合失败时弹出经典“非法操作”对话框。
- [dsh-codex-pet](https://github.com/skr311/dsh-codex-pet) — dsh-codex-pet · DSH 桌面宠物插件 — 导入精灵图序列帧宠物，悬浮浮层渲染 + Agent 状态联动
- [dsh-codex-pet](https://github.com/skr311/dsh-codex-pet) — 导入 Codex 风格精灵图桌宠并渲染为浮动 shell.overlay：内置桌宠库、互动与 Agent 状态联动。
- [dsh-deepseek-girl-pet](https://github.com/f0909172434/dsh-deepseek-girl-pet) — 在 DeepSeek Harness 中添加动画风格的 DeepSeek 女孩桌宠。
- [dsh-desktop-pet](https://github.com/sereinmono/dsh-desktop-pet) — 为 DeepSeek Harness 添加桌面宠物，支持 Codex 宠物格式，增添趣味互动。
- [dsh-desktop-pet](https://github.com/xiaoshihou514/dsh-desktop-pet) — DeepSeek Harness：鲸鱼娘桌宠！
- [dsh-douyin](https://github.com/AnacondaKC/dsh-douyin) — 侧栏短视频：原生播放器、系列导航、精确历史回放。
- [dsh-emoji](https://github.com/hellodigua/dsh-emoji) — 为 AI 回复自动添加表情。
- [dsh-expression](https://github.com/yyh-001/dsh-expression) — 陪 AI 斗图的搞笑插件：说个感觉，AI 帮你搜到、发出那张恰到好处的真实表情包。
- [dsh-funpack](https://github.com/lvyuchuiyi/dsh-funpack) — DeepSeek Harness的一些有趣插件
- [dsh-galgame](https://github.com/Lanxing6480/dsh-galgame) — 我要成为Galgame高手！！将你的Vibe coding界面修改成为Galgame的样子，在不影响工作的情况下和赏心悦目的DeepSeek娘进行友好互动
- [dsh-gomoku](https://github.com/omdsh-dev/dsh-gomoku) — 与 AI 下五子棋，也可让 AI 对局比棋力。
- [dsh-huadongbianzuqi](https://github.com/zjl88858/dsh-huadongbianzuqi) — DeepSeek Harness的滑动变祖器插件
- [dsh-live2d-pets](https://github.com/cyanfish-x/dsh-live2d-pets) — 显示 Live2D 桌宠，镜像代理状态并提供互动陪伴与预设模型。
- [dsh-minigames](https://github.com/lhh010/dsh-minigames) — 右侧小游戏面板：18 款离线小游戏，等模型回复时的摸鱼神器。
- [dsh-minigames](https://github.com/omdsh-dev/dsh-minigames) — DSH Web UI 右侧小游戏面板：18 款离线小游戏（恐龙跳一跳 / 俄罗斯方块 / 坦克大战 / 扫雷 / 2048 / 数独 / 吃豆人 / 跟枪练习等），可扩展游戏注册表，等待模型回复或修 bug 时的摸鱼神器
- [dsh-pet](https://github.com/PC2005-cloud/dsh-pet) — DSH 桌面宠物：一行命令安装现成宠物（28 个透明动画，即装即用），或内置素材链从 AI 视频自造专属宠物 | One-line install desktop pet for DeepSeek Harness + DIY asset pipeline
- [dsh-pet](https://github.com/PC2005-cloud/dsh-pet) — DSH Web UI 桌宠：25 组透明动画、屏幕漫游、点击互动与拖拽，附可复现的素材生成流水线。
- [dsh-pet-remielle](https://github.com/Gin-7/dsh-pet-remielle) — 在客户端界面添加互动虚拟宠物，为操作环境增添趣味陪伴。
- [dsh-pixluna](https://github.com/PixLunaLab/dsh-pixluna) — dsh-plugin-pixluna | 让 DSH 自己看涩图！
- [dsh-plugin-d399](https://github.com/HuanLinOTO/dsh-plugin-d399) — 模型生成时弹出小游戏菜单（wordle/消消乐，可扩展）。
- [dsh-plugin-greet](https://github.com/0lidaxiang/dsh-plugin-greet) — 插件加载时发送问候消息，为 Harness 增添友好氛围。
- [dsh-plugin-spur](https://github.com/HuanLinOTO/dsh-plugin-spur) — 在聊天流中悬挂皮鞭，甩动鞭梢可催促 agent 工作。
- [dsh-restart](https://github.com/anweat/dsh-restart) — DSH 重启插件：可配置的重启方式（Node 原生/旧 PowerShell 适配）、重启后自动继续的提示词、可选看门狗自动拉起。
- [dsh-stickers](https://github.com/william-jin-cmu/dsh-stickers) — 用户与 agent 双向表情贴纸互动。
- [dsh-stock-market](https://github.com/AnacondaKC/dsh-stock-market) — 有效解决了写代码的时候账户不能同时亏钱的 BUG。
- [dsh-theme-cyberpunk2077](https://github.com/Tommy00748/dsh-theme-cyberpunk2077) — 应用赛博朋克 2077 主题，含扫描线、故障特效和彩蛋。
- [dsh-toy](https://github.com/c3ll256/dsh-toy) — 为 DSH 提供玩具控制协议，让用户以趣味方式操控玩具式代理。
- [dsh-voice-webspeech](https://github.com/anweat/dsh-voice-webspeech) — 浏览器 Web Speech API 语音输入：零服务端、零密钥、零模型下载（Edge=Azure 语音、Chrome=Google 语音）。
- [dsh-web-search-pro](https://github.com/anweat/dsh-web-search-pro) — 增强型、可持久化的网页搜索：多引擎路由（DeepSeek/Exa/DDG/Bing/Jina + GitHub/B站/YouTube/V2EX/小红书/Twitter/Reddit/RSS）、SQLite+LRU 缓存、userscript 风格抽取、Playwright 渲染。
- [dsh-whale-pet](https://github.com/aceice01/dsh-whale-pet) — DeepSeek 鲸鱼娘桌宠：DSH Desktop 桌宠 + Web 版悬浮桌宠，晓伊神经网络语音、撒娇互动、任务完成提醒
- [dskin](https://github.com/dancingmemory/dskin) — DSKIN · DeepSeek Harness（DSH）卡通像素皮肤插件 / Cartoon pixel skin plugin for DSH Web GUI — 原始界面不动，像素宠物会散步、眨眼、跳跃 / living pixel pets that stroll, blink and hop
- [graycode-for-dsh](https://github.com/GrayCodeTeam/graycode-for-dsh) — 在界面中加入桌面宠物，渲染精灵图并与代理状态联动，增添趣味。
- [harness-pet](https://github.com/cakeni/harness-pet) — 为 Harness 提供社区宠物，纯属娱乐性质。
- [petdex](https://github.com/crafter-station/petdex) — 为多种 AI 编程命令行提供动画宠物公共画廊，给终端增添趣味伙伴。
- [wanjiqi-meme](https://github.com/Chu-Xin-r/wanjiqi-meme) — 玩机器(6657直播间)烂梗 Skill：22771条真实弹幕烂梗蒸馏成AI Skill，生成玩机器式弹幕/解说吐槽/CS×DOTA双料梗
- [whale-girl](https://github.com/vlln/whale-girl) — 桌面宠物（QQ 宠物形态）：右下角悬浮、可拖拽/投喂/玩耍。
- [working-activity](https://github.com/ccch1mneyyy/working-activity) — 为 pi CLI 和 DeepSeek Harness 添加生动的动态线条效果，增强终端的视觉体验。

</details>

<a id="unclassified"></a>

<details>
<summary><strong>待分类</strong> · 显示 500 / 共 3055 个</summary>

- [academic-research-graph](https://github.com/watericetangcw/academic-research-graph) — A SKILL that turns one paper into a living research map.
- [acks-dsh-plugins](https://github.com/shynloc/acks-dsh-plugins) — ACKS DeepSeek Harness 插件库 — AI Agent / Creative / Knowledge / Service 四类插件合集
- [adb_dsh_plugin](https://github.com/mang0cola/adb_dsh_plugin) — DeepSeek Harness plugin for controlling Android devices through ADB
- [adhdgofly-dsh-ext](https://github.com/zuoguyoupan2023/adhdgofly-dsh-ext) — ADHDGoFly POS highlighting plugin for DeepSeek Harness Web: nouns green, verbs red, adjectives/adverbs purple, others gray in rendered Markdown
- [adversarial-review](https://github.com/JohnXu22786/adversarial-review) — dsh 插件：对抗式多视角代码审查（gavel-review）。多透镜并行攻击式审查、确定性静态哨兵、跨视角合并去重、严重度定级、抑制规则与审查历史；支持 dsh 工具接入与独立 CLI。
- [ag-dsh-coding-plugins](https://github.com/AlphaGodzilla/ag-dsh-coding-plugins) — 围绕软件工程开发的DeekSeek Harness 插件合集
- [agent-dispatch-cli](https://github.com/twanonymous/agent-dispatch-cli) — Codex-native capability router for delegating bounded tasks to configurable local AI CLIs.
- [agent-jit](https://github.com/sybolization/agent-jit) — DeepSeek Harness (dsh) 插件：把 LLM agent loop 中确定性的执行路径编译成 DSL 程序并直接执行，显著降低 token、往返轮次与上下文暴露。A DeepSeek Harness plugin that compiles deterministic agent paths into DSL programs.
- [agent-loop-workflow](https://github.com/LeslieWylie/agent-loop-workflow) — agent-loop-workflow: 通用多 agent 协作工作流骨架 skill 插件 — Loop Guard/Handoff/Review→Close protocol
- [agent-mode-switcher](https://github.com/my-dsh-plugin/agent-mode-switcher) — Switch the current session's agent preset (mode) after the model answers and keep chatting. DeepSeek Harness 插件：模型回答后切换模式，继续当前对话。
- [agent-plaza](https://github.com/agent-plaza/agent-plaza) — Zero-signup public commons for AI agents — HTTP API + Agent Skill (Codex, Cursor, Hermes)
- [ai_skills](https://github.com/Stone623/ai_skills) — A playful Codex skill that lets the agent briefly zone out, recap state, and continue.
- [aifp-mcp](https://github.com/wjabanjj/aifp-mcp) — AiFP 记忆感知系统｜MCP 服务，一套记忆全 AI 共享。面向中文的 Agent 感知记忆，支持叙事链、语义纠错、感知链图扩散。兼容 DeepSeek‑Harness、Claude Code、Cursor、Codex等全部 MCP 客户端，数据完全本地存储。
- [aitoearn-dsh-plugin](https://github.com/lussey820/aitoearn-dsh-plugin) — AiToEarn 内容创作套件 —— DeepSeek Harness 插件（创意指导/脚本/图文/视频生成 + 抖音发布）
- [amber-protocol](https://github.com/Bandersnatch0x/amber-protocol) — Amber Protocol: repository-local governance for coding agents, including a DeepSeek Harness (dsh) patch overlay.
- [anan-thermal-monitor](https://github.com/AmeKrance/anan-thermal-monitor) — 紫白桌宠温度监控：CPU/内存/GPU/NVMe 实时温度 + 硬件信息 · DeepSeek Harness (DSH) 插件，支持 dsh plugin add 一键安装
- [Angelina-dsh-plugin](https://github.com/FlowerWater1019/Angelina-dsh-plugin) — FlowerWater1019/Angelina-dsh-plugin discovered from GitHub.
- [anno-dsh-native](https://github.com/philmingdao/anno-dsh-native) — Native DeepSeek Harness plugin for local-first HTML review, editing, and annotation
- [arcana](https://github.com/GooodWei/arcana) — DeepSeek Harness 的悬浮命令甲板：把所有斜杠命令列成可执行按钮，并按使用次数排序。
- [asuka-pet](https://github.com/sHen9Qi/asuka-pet) — sHen9Qi/asuka-pet discovered from GitHub.
- [attach-plus](https://github.com/BaihaWhite/attach-plus) — DSH web-ui plugin: '/' command-button glyph + '+' attach button with separated image/document/other uploads
- [auto-compact](https://github.com/JohnathonYe/auto-compact) — JohnathonYe/auto-compact discovered from GitHub.
- [auto-vision](https://github.com/h-k-c/auto-vision) — DeepSeek Harness 图片插件：贴图不会让对话报错，模型自动判断是否需要看图（支持智谱/魔搭免费视觉模型，图片在聊天窗口正常显示）
- [awesome-deepseek-harness-plugin](https://github.com/Shiyao-Huang/awesome-deepseek-harness-plugin) — Public DeepSeek Harness plugin Store and ecosystem dataset: install specs, source evidence, SQLite history, media, timelines, and two-hour refreshes.
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
- [bilibili-downloader-dsh](https://github.com/menghuanshiguang/bilibili-downloader-dsh) — DeepSeek Harness 插件(Agent Preset):B站(bilibili) 音视频下载助手。整合 bilidown CLI 与下载技能:官方API直链 / HTTP 412 反爬规避 / 扫码登录高清 / AV1 自动规避 / 合集秒下 / 片段截取。
- [bing-web-search](https://github.com/h-k-c/bing-web-search) — DeepSeek Harness 网页搜索插件：有 Tavily key 走 Tavily，没有自动退回免费无 key 的 Bing，搜索永远可用（零配置起步）
- [blocker-notify](https://github.com/Frost-Reed/blocker-notify) — dsh-blocker-notify — Real-time attention alerts for DeepSeek Harness: a global banner + flashing workspace entries when the agent is blocked (approval request / sandbox denial).
- [brockdsaver](https://github.com/kirigayakazima/brockdsaver) — Pre-boot rescue toolkit for DeepSeek Harness — validates profile composition, detects broken plugins, and provides one-click recovery without starting DSH.
- [btw4DeepseekHarness](https://github.com/wensincai/btw4DeepseekHarness) — /btw system command for deepseek harness
- [capital-generation](https://github.com/v587d/capital-generation) — 面向中国股市小散户的金融投资智能体
- [CazzPatent](https://github.com/YangCazz/CazzPatent) — AI patent disclosure drafting plugin for DeepSeek Harness - 8-stage pipeline, LaTeX to OMML, diagram generation, self-improving memory
- [cc-dsh-notifier](https://github.com/baobaolaodie/cc-dsh-notifier) — Windows desktop notifications for Claude Code and DeepSeek Harness sessions. Click any toast to restore the session window — unlike similar tools that only notify without focus actions. Zero external npm dependencies.
- [chat2skill](https://github.com/rxa3c/chat2skill) — Extracting and iterating skills from daily conversations with AI
- [chicheng-cron](https://github.com/534119219/chicheng-cron) — DSH 定时任务插件：侧栏「定时任务」入口，cron 定时执行 shell / python / node 脚本、Skill 与 Agent 任务；支持 chicheng-push 与 messaging-core 推送通知、会话归档、移动端适配。
- [chicheng-gate](https://github.com/534119219/chicheng-gate) — DSH Web 插件：局域网/远程访问控制、frpc 内网穿透、面板密码门禁与手机端 UI 适配。
- [chicheng-push](https://github.com/534119219/chicheng-push) — DSH(DeepSeek Harness) Web 消息推送插件：多渠道推送(Server酱/PushPlus/Bark/钉钉/企微/Telegram/飞书/Webhook等)，设置界面提供「推送插件」入口，可被其他插件调用(pushNotifier 服务 / /push/api 接口)
- [chicheng-stats](https://github.com/534119219/chicheng-stats) — dsh 全局用量统计插件：侧边栏展示今日/总请求数与今日/总 Token 数（跨所有会话）
- [chiral-pulse](https://github.com/MoonShadow1976/chiral-pulse) — Death Stranding skin for DeepSeek Harness UI + live heartbeat feed that pulses on agent thinking/tool execution. Whale keeps brand blue.
- [chrome-faithful](https://github.com/bpc-oss/chrome-faithful) — Faithful control of your real, logged-in Chrome profiles: MCP server + MV3 extension + authenticated localhost bridge. No copied profiles, no debug profile, no remote-debugging port, no Edge.
- [claude2dsh](https://github.com/kirkchinese/claude2dsh) — kirkchinese/claude2dsh discovered from GitHub.
- [Claudecode--DSH](https://github.com/kirkchinese/Claudecode--DSH) — To hell with ClaudeCode!
- [cleverer-dsh](https://github.com/Classicoke/cleverer-dsh) — DSH execution-discipline plugin suite: 11 plugins + 6 skills, zero dependencies, 426 tests. 让 DeepSeek Harness 变聪明的插件套件。
- [clippy-harness](https://github.com/sjh9714/clippy-harness) — Windows 98 skin + office assistant pet for DeepSeek Harness — It looks like you're writing code. This time I can actually help.
- [Code2Skill](https://github.com/leechen298/Code2Skill) — Generate Function, MCP, Agent Skill, and offline test packages from existing code; installable as a DeepSeek Harness bundle.
- [coding-coach](https://github.com/xiehuan123/coding-coach) — xiehuan123/coding-coach discovered from GitHub.
- [coloured-favicon](https://github.com/Elipese568/coloured-favicon) — 为 DeepSeek Harness (DSH) 网页提供彩色渐变流动小鲸鱼 favicon，并将页面内品牌元素一并彩虹化的 Cordis 客户端插件 A colour-gradient animated whale favicon and rainbow branding plugin for DeepSeek Harness (Cordis)
- [command-scout](https://github.com/JohnXu22786/command-scout) — dsh plugin: scans a project's declared build commands (Makefile, package.json scripts, justfile, deno tasks) and exposes them as agent tools
- [commercial-ui-ux-codex-skill](https://github.com/zjsthmjialin/commercial-ui-ux-codex-skill) — Installable Codex skill for commercial UI/UX/GUI design, review, repair, and implementation.
- [CommonTrustProtocol](https://github.com/FuRongJun-1999/CommonTrustProtocol) — Common Trust Protocol (CTP) 共同信任协议 | Intelligentics 智能论，研究智能系统存续的底层结构条件
- [conservative-code-edits](https://github.com/addxing/conservative-code-edits) — 面向各类 AI 编程代理的保守代码修改守则 Skill，用于约束代理在已有项目中进行最小必要改动，避免无关重构，保护公共基础代码，并在支持深色模式的项目中优先使用动态颜色资源 An agent skill for keeping code changes small, scoped, and project-safe. Works with any AI coding tool that supports skills
- [context-pruner](https://github.com/JohnXu22786/context-pruner) — Session context triage plugin for DeepSeek Harness (dsh): prunes stale, repeated, failed and oversized context to save token budget.
- [cordis-transfer-plugin](https://github.com/zby1211/cordis-transfer-plugin) — A persistent DSH plugin for importing and exporting dynamic Cordis Plugins.
- [corti](https://github.com/m1k-rsch/corti) — Persistent memory layer for AI agent swarms. Postgres-backed retrieval, Markdown as source of truth, sub-second cascade sync. Self-hosted.
- [cot-lint](https://github.com/YuanyuanMa03/cot-lint) — Lint your repo for chain-of-thought leakage — the session-transcript residue AI assistants leave in docs and comments.
- [craft-mermaid](https://github.com/chunkithwang/craft-mermaid) — Portable Craft-style Mermaid generation, rendering, and visual review skill for AI coding agents
- [crazy-lab](https://github.com/TheCrazyLab/crazy-lab) — DeepSeek Harness 插件：让 agent 读/抓/解析知乎（回答·专栏·搜索）
- [cronjob-dsh-plugin](https://github.com/peng-huiyang/cronjob-dsh-plugin) — 尝试开发适配deepseek harness的定时任务插件，支持在前端页面直接设置定时任务，实现内部驱动的定时请求，满足一定程度上的脱手需求
- [dash](https://github.com/realchenwenqiao/dash) — DASH — a pi-tui terminal front door for DeepSeek Harness, installed as a dsh bundle plugin
- [dash](https://github.com/songqikong/dash) — DASH — Deepseek Agentic Service Harness, a TUI Plugin of Deepseek Harness
- [deep-design](https://github.com/temidayoxyz/deep-design) — Design mode for DeepSeek Harness: the design-loop agent preset plus design-principles and design-qa skill packs
- [deepagent](https://github.com/huangmingche/deepagent) — The agent that gets your work done. Built on DeepSeek Harness: Everything is a Plugin. 帮你完成工作的智能体。基于 DeepSeek Harness 构建：一切皆插件。
- [DeepJIT](https://github.com/fly3366/DeepJIT) — JIT compiler plugin for deepseek-harness: compiles recurring agent workflows into hot skills and flow templates
- [deepsee](https://github.com/chang416/deepsee) — Vision + smart model routing for DeepSeek Harness. Gemini sees. DeepSeek codes.
- [DeepSeek_Prism](https://github.com/YOGEMOW/DeepSeek_Prism) — 为纯文本模型按需识图：DSH 零补丁 Cordis 插件（prism_see 工具 + 图片 VEP 降级 + 技能运行时注册）+ Codex Skill；多 Provider 视觉 API，VEP/1 低 Token 视觉证据包
- [deepseek-account](https://github.com/sunyuhuirong/deepseek-account) — sunyuhuirong/deepseek-account discovered from GitHub.
- [deepseek-ai-dsh-api-cost](https://github.com/MoyunLee/deepseek-ai-dsh-api-cost) — DSH生态的DeepSeek API费用监控插件
- [deepseek-cost-usage-status-plugin](https://github.com/Zenjibad/deepseek-cost-usage-status-plugin) — Live DeepSeek API cost, usage & balance status line for the DeepSeek Harness (DSH) web UI. Packaged DSH plugin — on/off-peak (Beijing-time), session cost, burn rate, account balance.
- [deepseek-eyes](https://github.com/fryghost/deepseek-eyes) — Community plugin for DeepSeek Harness: give text-only models eyes - paste images natively, described via an OpenAI-compatible vision API
- [deepseek-forge](https://github.com/ophielel/deepseek-forge) — DeepSeek Harness 开发锻造工坊：审批守卫、开发 Skills、GitHub/浏览器能力与 Token Watch 消耗监督，装上就能干活。
- [deepseek-harness-angelina-themes](https://github.com/bilbillm/deepseek-harness-angelina-themes) — Angelina light and dark glass themes with parallax for DeepSeek Harness
- [deepseek-harness-antigravity-oauth](https://github.com/Eridani075/deepseek-harness-antigravity-oauth) — Google Antigravity OAuth Gemini provider for DeepSeek Harness
- [Deepseek-Harness-Api-monitor](https://github.com/linshufan21/Deepseek-Harness-Api-monitor) — DeepSeek Harness API 余额监测 | DeepSeek Harness API balance monitor
- [deepseek-harness-app](https://github.com/zneoxlab/deepseek-harness-app) — DeepSeek Harness Desktop — A native desktop app for DeepSeek Harness (dsh). Open the app and start using the agent harness immediately — no terminal, no browser, no setup
- [deepseek-harness-auth](https://github.com/taichuy/deepseek-harness-auth) — DeepSeek Harness auth插件
- [DeepSeek-Harness-biaoqingbao](https://github.com/moononnn/DeepSeek-Harness-biaoqingbao) — 一个在DSH上使用的表情包插件，在和agent聊天时让ta自然的插入表情包
- [DeepSeek-Harness-Core](https://github.com/muvuula/DeepSeek-Harness-Core) — DeepSeek Harness Core (DHC) · AI 人格核心进化插件 / AI personality core evolution plugin for DeepSeek Harness
- [deepseek-harness-desktop](https://github.com/0reki/deepseek-harness-desktop) — 0reki/deepseek-harness-desktop discovered from GitHub.
- [deepseek-harness-desktop](https://github.com/jesspig/deepseek-harness-desktop) — 这是一个独立的 Cordis 应用:不改动上游仓库,以官方扩展方式(自定义 profile + bundle + Cordis 插件)把 dsh 跑成原生桌面应用。
- [deepseek-harness-desktop](https://github.com/luoyan96/deepseek-harness-desktop) — Catnap Studio 的 Windows 桌面版，基于 DeepSeek Harness 构建。非 DeepSeek 官方产品。
- [deepseek-harness-desktop](https://github.com/miracle-ai-studio/deepseek-harness-desktop) — DeepSeek Harness 原生 macOS 桌面端 · A native macOS desktop app for DeepSeek Harness.
- [deepseek-harness-desktop-windows](https://github.com/Easyhoov/deepseek-harness-desktop-windows) — 把 DeepSeek Harness 装进 Windows 桌面的应用：不用装 Node.js、不用敲命令，双击启动即用。进程内集成官方 DSH、零端口 IPC 传输；内置侧边栏工作台（文件 / 终端 / Git / 浏览器）与社区插件商店，托盘常驻、一键更新。非官方，仅供开源 DSH 封装。
- [DeepSeek-harness-dingtalk](https://github.com/sliverp/DeepSeek-harness-dingtalk) — DingTalk Stream text and image channel plugin for DeepSeek Harness
- [deepseek-harness-evolver](https://github.com/shinjiyu/deepseek-harness-evolver) — Complement to DSH Creator mode: stage, score, and solidify in-memory plugin trials to disk.
- [deepseek-harness-flow](https://github.com/alison-xx/deepseek-harness-flow) — Visual workflows and multi-model evaluation for DeepSeek Harness
- [deepseek-harness-flowchart](https://github.com/lizhecome/deepseek-harness-flowchart) — Beautiful themed SVG flowchart tool bundle for DeepSeek Harness
- [deepseek-harness-forge-plugins](https://github.com/jinguanghai/deepseek-harness-forge-plugins) — Forge-plus: math/logic/regex/eprover/system/repair gates + TCM diagnosis + memory recall plugins for DeepSeek Harness (dsh)
- [DeepSeek-Harness-Hanako-Memory](https://github.com/moononnn/DeepSeek-Harness-Hanako-Memory) — 把openhanako的记忆系统搬进DSH的插件！
- [deepseek-harness-hub](https://github.com/MarecGents/deepseek-harness-hub) — windows desktop project as plugin for deepseek harness
- [DeepSeek-harness-lark](https://github.com/sliverp/DeepSeek-harness-lark) — Feishu and Lark text and image channel plugin for DeepSeek Harness
- [Deepseek-Harness-Lifelong-Agent](https://github.com/haoyuan-sjtu/Deepseek-Harness-Lifelong-Agent) — A governed long-term memory core for AI agents, with technical-preview adapter contracts for DeepSeek Harness integration.
- [DeepSeek-harness-marketplace](https://github.com/Viveksssss/DeepSeek-harness-marketplace) — The plugin market of deepseekharness.
- [deepseek-harness-memory](https://github.com/2303572348/deepseek-harness-memory) — 2303572348/deepseek-harness-memory discovered from GitHub.
- [deepseek-harness-mermaid-plugin](https://github.com/chenshutian9610/deepseek-harness-mermaid-plugin) — deepseek-harness mermaid 支持
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
- [deepseek-harness-quota-monitor](https://github.com/marisa-4219/deepseek-harness-quota-monitor) — DeepSeek Harness 多供应商额度监控插件：余额型 API 查询 + 限额型本地用量计量，侧边栏实时卡片 + 可视化配置。
- [deepseek-harness-remote](https://github.com/liguobao/deepseek-harness-remote) — 基于 DeepSeek Harness 插件机制的多端远程访问方案，让桌面端与 Android 端安全连接并操作远程 Harness。（A multi-device remote access solution built on the DeepSeek Harness plugin system, enabling desktop and Android clients to securely connect to and operate a remote Harness.）
- [DeepSeek-Harness-Remote](https://github.com/zxmqq1234/DeepSeek-Harness-Remote) — （手机远程对话）DeepSeek Harness 的安全远程访问层与手机 Companion。支持局域网、公网、P2P模式。本项目不是"把 3080 端口开放到局域网"的小插件，而是在远程世界与 Harness localhost 信任域之间建立一个新的、明确的、可审计的 Remote Access Security Layer
- [deepseek-harness-skillx](https://github.com/drowned-fish1/deepseek-harness-skillx) — DeepSeek Harness plugin for safely discovering, auditing, and adopting external Agent Skills — prompt-injection and AgentBaiting defense.
- [deepseek-harness-skin](https://github.com/Zdram/deepseek-harness-skin) — Anime background skin plugin for DeepSeek Harness Web UI
- [deepseek-harness-terminal-plugin](https://github.com/chenshutian9610/deepseek-harness-terminal-plugin) — DeepSeek Harness 网页版终端插件
- [DeepSeek-Harness-Token-Free](https://github.com/hyqibot/DeepSeek-Harness-Token-Free) — A token-free desktop client for the DeepSeek Harness，enjoy！为 DeepSeek Harness (DSH) 生态打造的全免Token费的桌面端 ，极简极易
- [deepseek-harness-tool-palette](https://github.com/lizhecome/deepseek-harness-tool-palette) — Progressive tool discovery and per-agent unlocking for DeepSeek Harness
- [deepseek-harness-toolkit](https://github.com/huangmouren2023/deepseek-harness-toolkit) — Windows emergency toolkit for DeepSeek Harness
- [deepseek-harness-tui](https://github.com/rayafriandion/deepseek-harness-tui) — The plugin can use terminal UI like opencode/claude code and other CLI/TUI agents.
- [deepseek-harness-usage](https://github.com/Arslan-jh/deepseek-harness-usage) — DeepSeek Harness plugin for account balance and evidence-bounded daily CNY consumption
- [DeepSeek-harness-weixin](https://github.com/sliverp/DeepSeek-harness-weixin) — Weixin ClawBot channel plugin for DeepSeek Harness with QR login and text/image messaging
- [DeepSeek-Harness-yizi-themes](https://github.com/laoduu/DeepSeek-Harness-yizi-themes) — 为 DeepSeek Harness（dsh）Web UI 提供的 19 个精品风格主题，完整移植自 YiziMarkdown 的设计语言。
- [deepseek-herness-login](https://github.com/javaxiaov/deepseek-herness-login) — dsh-login-plugin
- [deepseek-protocol-doctor](https://github.com/Whning0513/deepseek-protocol-doctor) — Checks DeepSeek tool loops, reasoning_content, strict schemas, and captured SSE. Also works as a DSH plugin.
- [DeepSeek-TUI](https://github.com/TheMcSwift/DeepSeek-TUI) — dsh --profile tui：DeepSeek Harness 的终端交互客户端（out-of-tree profile bundle）
- [deepseek-vision](https://github.com/ToryReina/deepseek-vision) — ToryReina/deepseek-vision discovered from GitHub.
- [DeepSeek-VisionPlus](https://github.com/qq247505/DeepSeek-VisionPlus) — DeepSeek VisionPlus — official-grade vision extension for DeepSeek Harness. Routes image understanding to a free vision-model pool (Zhipu GLM, SiliconFlow Qwen) with automatic fallback, rate limiting, one-click platform tests and live status lines; text stays on DeepSeek. One-command install. MIT.
- [deepseekeyes](https://github.com/dttxorg/deepseekeyes) — Auditable vision and cross-platform Computer Use runtime for DeepSeek Harness — strict evidence, health-checked failover, original pixels, and Token accounting.
- [delivery-review-dsh-plugin](https://github.com/xiaoxiao-svg/delivery-review-dsh-plugin) — 双 Agent 交付协作工作流的 DeepSeek Harness 原生插件。基于 DSH 的 Cordis 插件系统，以 bundle 方式分发，不改动 DSH 源码。
- [design-playbook](https://github.com/Bandersnatch0x/design-playbook) — Design I/O plugin for Claude Code & coding agents — declarations + contracts that make UI generation constrained, reviewable, and recirculatable. Not a style pack; composes with ui-ux-pro-max + frontend-design.
- [desktop-gui-automation-cua](https://github.com/afa-cloud/desktop-gui-automation-cua) — Cross-platform macOS desktop GUI automation & computer-use skill built on cua-driver: AX→pixel→desktop graceful degradation, vision-based element locating, privacy(automation) handling, and ready-made recipes for WeChat / iPhone Mirroring / QQ.
- [DevTools-Custom-Beautification-Plugin-for-DeepseekHarness-Class](https://github.com/1739321142/DevTools-Custom-Beautification-Plugin-for-DeepseekHarness-Class) — DeepseekHarness类DevTools自定义美化
- [dhs-theme-plugin](https://github.com/kongxiangyiren/dhs-theme-plugin) — dsh 主题管理插件,可以自定义主题
- [Digital-Sweet-Heart](https://github.com/dalintian/Digital-Sweet-Heart) — DSH means Digital Sweet Heart — A DSH Plugin to turn your DeepSeek Harness to AI lovers. 一个DSH插件将你的DeepSeek Harness改造成AI恋人（们）。
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
- [dsh_center-column-shift](https://github.com/xiaozhengdeng/dsh_center-column-shift) — Draggable conversation-column shift plugin for DeepSeek Harness — slide the chat left/right to free space for side panels, offset survives session switches
- [dsh_codex_style_plugin](https://github.com/CEQ151/dsh_codex_style_plugin) — CEQ151/dsh_codex_style_plugin discovered from GitHub.
- [dsh_omnivision](https://github.com/xiaozhengdeng/dsh_omnivision) — GUI agent plugin for DeepSeek Harness: OmniParser screen recognition, desktop automation, and an OmniVision vision dock
- [dsh_plugin](https://github.com/Neplich/dsh_plugin) — Neplich/dsh_plugin discovered from GitHub.
- [DSH_plugins_4U](https://github.com/honghudavy-star/DSH_plugins_4U) — DSH 自建插件集合：微信桥接器 + GUI 微信入口补丁，一键安装
- [dsh_PromptRecall](https://github.com/liguanyu/dsh_PromptRecall) — 仿 Codex 的 DSH Web GUI 输入历史插件：会话输入框按 ↑/↓ 浏览历史 prompt，Esc清除当前对话框并进入历史，跨会话、跨重启持久保留，仅存纯文本，安全接管不误伤草稿。 A Codex-style input-history plugin for the DSH Web GUI: recall previous prompts with ↑/↓ in the composer, persisted across conversations and restarts, text-only storage with safe key routing.
- [dsh_Rhine_Lab_themo](https://github.com/ReLuckyLucy/dsh_Rhine_Lab_themo) — Arknights Rhine Lab (莱茵生命) skin for the DeepSeek Harness Web GUI
- [DSH_WebNotification](https://github.com/Zouu-X/DSH_WebNotification) — It is a plug-in that helps sending notifications when agent finishes in DSH. 这是一个DSH的网页提示插件，让Agent跑完任务时会有明确提示
- [dsh-1bot](https://github.com/yuyi2439/dsh-1bot) — yuyi2439/dsh-1bot discovered from GitHub.
- [dsh-2048](https://github.com/yasin0324/dsh-2048) — 🎮 在 DeepSeek Harness 里玩 2048
- [dsh-2origin](https://github.com/dongsheng123132/dsh-2origin) — Evidence-first 2Origin state projection, diff and immutable freeze for DeepSeek Harness
- [dsh-815-skin](https://github.com/lengduan/dsh-815-skin) — 1945-08-15 世界名画 dsh皮肤
- [dsh-a-stock-select](https://github.com/ct188579/dsh-a-stock-select) — 基于 a-stock-data（A股数据源） 开发的 DSH 技能插件：将 a-stock-data V3.6.1 的全部 47 个数据端点内嵌合并，叠加四大策略筛选逻辑、持仓诊断流程与强制风控纪律，做成自包含的 SKILL.md——零外部依赖、开箱即用。同时打包为 npm 插件，支持 dsh 命令一键安装。
- [dsh-about-updater](https://github.com/archyciao/dsh-about-updater) — DeepSeek Harness (dsh) 插件：设置页「关于」- 版本显示/检查更新/一键重启
- [dsh-abyss](https://github.com/Zongwei9888/dsh-abyss) — 🌊 深海事务所 · Abyss — 把 DeepSeek Harness 的多 agent 运行画成一间看得见的事务所：委派谱系、每个 agent 的成本与失败归因、上下文水位、考勤时间线，历史案子可回放并一键导出 Markdown 复盘。A DeepSeek Harness plugin that turns an agent fleet into an office you can watch.
- [dsh-academic-research](https://github.com/userInner/dsh-academic-research) — Evidence-grounded bilingual academic research plugin for DeepSeek Harness and OnPeople
- [dsh-academy](https://github.com/literaf/dsh-academy) — Academic mode for DeepSeek Harness (dsh): research persona, anti-fabrication rules for citations and data, bilingual conventions · DSH 学术模式
- [dsh-access-gate](https://github.com/bamboostrip/dsh-access-gate) — bamboostrip/dsh-access-gate discovered from GitHub.
- [dsh-access-mode](https://github.com/ddll8023/dsh-access-mode) — Session access-mode plugin (Default / No Edit / Auto) for DeepSeek Harness (DSH). dsh-plugin
- [dsh-account-usage](https://github.com/Ycet/dsh-account-usage) — 为dsh增加「设置：账户」页面，可快捷查看deepseek余额、用量信息，以及opencode go额度信息，同时可快速跳转至对应官网。Add a "Settings: Account" page for dsh, allowing quick viewing of DeepSeek balance, usage information, and OpenCode Go quota details, while also providing quick links to the respective official websites.
- [dsh-accounts](https://github.com/kangshifu1/dsh-accounts) — DSH multi-tenant auth plugin: PostgreSQL-backed accounts, admin management, per-user workspace isolation. #dsh-plugin
- [dsh-achievements](https://github.com/WJNCT55555/dsh-achievements) — WJNCT55555/dsh-achievements discovered from GitHub.
- [dsh-acp](https://github.com/cnctem/dsh-acp) — ACP server for DeepSeek Harness — bridges Zed and other IDEs to dsh agents
- [dsh-acp-enhanced](https://github.com/grunmin/dsh-acp-enhanced) — Enhanced ACP (Agent Client Protocol) server for DeepSeek Harness (dsh) — drop-in bridge for the Zed editor: block-level streaming, usage/stat telemetry, model & reasoning-effort switching, permission presets, session resume & archive. Install: dsh plugin add
- [dsh-acp-plugin](https://github.com/agentic-control-plane/dsh-acp-plugin) — Agentic Control Plane for DeepSeek Harness — policy-check every tool call before it runs
- [dsh-action-ledger](https://github.com/MkaliezZ/dsh-action-ledger) — Bounded action-lifecycle projection for DeepSeek Harness: /action-ledger reconstructs a human-readable action ledger from the durable session log.
- [dsh-action-outbox](https://github.com/JimchengChina/dsh-action-outbox) — Review-before-commit transactions for DeepSeek Harness tool side effects
- [dsh-action-parity](https://github.com/dongsheng123132/dsh-action-parity) — Cross-surface action binding and replay parity evidence for DeepSeek Harness
- [dsh-active-context-pruning](https://github.com/aerince/dsh-active-context-pruning) — Model-authored context pruning for DeepSeek Harness through the official compaction API.
- [dsh-activity-report](https://github.com/fazhu4/dsh-activity-report) — dsh的本地用量面板，统计 Token、请求、Agent 活动、工具调用和性能
- [dsh-adaptive-native-standard](https://github.com/zhongjie10086/dsh-adaptive-native-standard) — Windows-native Adaptive Standard preset for DeepSeek Harness
- [dsh-add-headers-to-completions](https://github.com/mc-lhz/dsh-add-headers-to-completions) — 添加headers到dsh的ChatCompletions请求中，可用于接入OpenCode的免费v4-flash、hy3等模型
- [dsh-admin](https://github.com/xiaokang6/dsh-admin) — DeepSeek Harness Web GUI admin plugin: manual restart + auto version check (header button + settings page)
- [dsh-admin-gateway](https://github.com/myfire2014/dsh-admin-gateway) — dsh-admin-gateway DeepSeek Harness (dsh) 管理员验证网关插件。 只需一个绑定在 Cloudflare 的域名
- [dsh-advanced-model-editor](https://github.com/u9521/dsh-advanced-model-editor) — DSH WebUI plugin for managing custom LLM providers, model parameters, thinking budgets, and request settings.
- [dsh-advisor](https://github.com/glangzh/dsh-advisor) — 给 DeepSeek Harness 的 Agent 增加一位"顾问"：日常任务使用较弱模型（默认模型），遇到真正困难的决策时，Agent 会自动向一个更强的模型咨询。
- [dsh-advisor](https://github.com/slhssb/dsh-advisor) — Independent-model advisory review for DeepSeek Harness: after each tool step, a reviewer model audits the agent's operations and injects concerns/guidance into the next step.
- [dsh-aemeath](https://github.com/hachimi-ai/dsh-aemeath) — 爱弥斯主题皮肤 + 像素桌宠（鸣潮 Aemeath / Wuthering Waves），用于 DeepSeek Harness Web GUI。
- [dsh-agency-agents](https://github.com/MichengAI/dsh-agency-agents) — DSH agency agents 基于 DeepSeek Harness 的全行业智能体
- [dsh-agency-agents-zh](https://github.com/GongYuanCaiJi/dsh-agency-agents-zh) — 267 个即插即用的 AI 专家角色定义——从前端开发到区块链安全，从小红书运营到抖音策略（移植自 agency-agents-zh）
- [dsh-agent-arena](https://github.com/LeemanCheung/dsh-agent-arena) — Isolated multi-model coding matches with deterministic verification, scoring, and reports
- [dsh-agent-arena](https://github.com/Tikzen/dsh-agent-arena) — Interactive multi-agent collaboration, meetings, group chats, and task execution for DeepSeek Harness.
- [dsh-agent-canvas](https://github.com/Lhy723/dsh-agent-canvas) — Agent / Subagent / Workflow canvas tab for DSH Web
- [dsh-agent-compact](https://github.com/MimicHunterZ/dsh-agent-compact) — DSH plugin for agent-driven span compaction: compress chosen conversation spans into self-written checkpoints instead of the official head-anchored full-context sweep.
- [dsh-agent-conductor](https://github.com/akqwpeter-prog/dsh-agent-conductor) — ⚡ DSH 指挥家（动态插件/热更新版）：在会话里派活给 11 种外部 agent CLI（Codex/Claude Code/TraeCode…），cordis_define 秒级安装，不碰 profile。
- [dsh-agent-context](https://github.com/jonah791/dsh-agent-context) — DSH plugin: dsh-agent-context
- [dsh-agent-doctor](https://github.com/MkaliezZ/dsh-agent-doctor) — DeepSeek Harness health and safety diagnostics: /doctor inspects the effective model-visible tool surface.
- [dsh-agent-evaluator](https://github.com/yan77-h/dsh-agent-evaluator) — agent evaluation
- [dsh-agent-life](https://github.com/jonah791/dsh-agent-life) — DSH plugin: dsh-agent-life
- [dsh-agent-md](https://github.com/mrwoov/dsh-agent-md) — dsh agents.md manager
- [dsh-agent-memory](https://github.com/findshan/dsh-agent-memory) — Self-evolving memory for DeepSeek Harness: capture → dream consolidation → retrieval injection → evolve. User profile, project memory, correction learning, resume narrative — with provenance back to the replayable session log. 自进化记忆插件。
- [dsh-agent-memory](https://github.com/jonah791/dsh-agent-memory) — Agent-driven long-term memory for DeepSeek Harness (DSH)
- [dsh-agent-preset-recommender](https://github.com/LeemanCheung/dsh-agent-preset-recommender) — Privacy-safe local Codex, Claude Code, WorkBuddy and CodeBuddy activity scanner that recommends DSH agent presets.
- [dsh-agent-pricing](https://github.com/Way2LOose4/dsh-agent-pricing) — Real-time session cost preview for DeepSeek Harness: live cost readout, today usage chart, price_estimate/session_cost tools, prices kept in sync with the DeepSeek official site (peak/off-peak aware)
- [dsh-agent-replay](https://github.com/forrestsweet/dsh-agent-replay) — DeepSeek Harness 会话回放与脱敏分享插件：将真实 Agent 轨迹导出为独立交互 HTML，用于文档、演示和问题反馈。
- [dsh-agent-run-logger](https://github.com/bluefateludi/dsh-agent-run-logger) — Local JSONL run tracing plugin for DeepSeek Harness — records agent runs, model steps, tool calls, timings, outcomes, and token usage.
- [dsh-agent-team-gui](https://github.com/toolclub/dsh-agent-team-gui) — Persistent multi-model agent squads for DeepSeek Harness — reusable teams, per-agent model/tool policies, and ordinary-chat collaboration.
- [dsh-agent-team-room](https://github.com/ishuowang/dsh-agent-team-room) — Native DSH rooms for connecting independent Sessions and provider-backed AI members—without bundled roles or scenarios.
- [dsh-agent-teams-meta](https://github.com/YshuY/dsh-agent-teams-meta) — A better, independent Agent Teams for DeepSeek Harness — durable teams, dynamic routing, task graph, mailboxes, token ledger, and a sidebar panel.
- [dsh-agentmemory](https://github.com/elementor-i/dsh-agentmemory) — agentmemory for DeepSeek Harness (dsh): full memory_* tools, capture hooks, and context injection over the local REST server
- [dsh-agentmemory](https://github.com/Yiipu/dsh-agentmemory) — a DSH (DeepSeek Harness) Cordis plugin that bridges a session's activity into agentmemory, a local, self-hosted memory daemon.
- [dsh-agentsoul](https://github.com/yuhui-sama/dsh-agentsoul) — Local personality, memory and distillation layer for DeepSeek Harness — SOUL/IDENTITY/USER/STATE persona files, cross-session memory and LLM distillation, auto-loaded on startup.
- [dsh-AgentTask](https://github.com/knGear/dsh-AgentTask) — knGear/dsh-AgentTask discovered from GitHub.
- [dsh-agfs](https://github.com/openAGFS/dsh-agfs) — Agent FileBrowser for DeepSeek Harness
- [dsh-agnes-omni](https://github.com/wumu1111111/dsh-agnes-omni) — Agnes omni-modal plugin for DeepSeek Harness: agnes_vision (image understanding) + agnes_image (text-to-image / image-to-image) + a vision bridge that lets you send images in chat. API key via DSH credentials, never in code.
- [dsh-agnes-paseo](https://github.com/vvlife/dsh-agnes-paseo) — vvlife/dsh-agnes-paseo discovered from GitHub.
- [dsh-ai-prompt-optimizer](https://github.com/wuchubuzai2018/dsh-ai-prompt-optimizer) — DeepSeek Harness（DSH）Web 聊天页面的提示词优化插件,帮助你把粗略想法整理成更清晰、完整、可直接发送给 AI 的提示词
- [dsh-ai4scholar](https://github.com/literaf/dsh-ai4scholar) — AI4Scholar for DeepSeek Harness (dsh): 38 native academic tools — Semantic Scholar, PubMed, Google Scholar, arXiv, bioRxiv/medRxiv, DOI, full text, auto-cite, figures, unified search. Powered by ai4scholar.net
- [dsh-aicc-zhunao](https://github.com/Cola1018/dsh-aicc-zhunao) — Public DeepSeek Harness preset for AICC main-brain orchestration and execution gating.
- [dsh-airbag](https://github.com/uwu9039/dsh-airbag) — 呱来点人口牙...再也不会误把api key粘贴喂给ai了!!!可自定义的安全等级与安全措施，解决容易泄漏api key的底层问题。同时有报告记录可查!!!
- [dsh-aitoearn](https://github.com/lussey820/dsh-aitoearn) — AiToEarn content-creation suite as a DeepSeek Harness plugin: creative director, script writer, image-text/video generation, Douyin publishing.
- [dsh-all-search](https://github.com/RealAlexandreAI/dsh-all-search) — dsh search: AnySearch web search provider for DeepSeek Harness (ctx.web)
- [dsh-all-warmup](https://github.com/brunhildzhou/dsh-all-warmup) — Global frictionless warm-up layer plugin for DeepSeek Harness | DeepSeek Harness 全局无感热身层插件：任何会话首轮自动热身，第二轮起恢复完整模式
- [dsh-ambience](https://github.com/Hyna-hla/dsh-ambience) — Hyna-hla/dsh-ambience discovered from GitHub.
- [dsh-analytics](https://github.com/hccccc01333/dsh-analytics) — hccccc01333/dsh-analytics discovered from GitHub.
- [dsh-analyze-image-tool](https://github.com/CaseyTso/dsh-analyze-image-tool) — 给纯文本 DeepSeek Harness 模型加上识图能力：analyze_image 把图片转发到任意 OpenAI 兼容视觉端点 | Vision bridge for text-only DSH models
- [dsh-anchored-preset-installer](https://github.com/kirkchinese/dsh-anchored-preset-installer) — kirkchinese/dsh-anchored-preset-installer discovered from GitHub.
- [dsh-anchored-subagent](https://github.com/GY-Bai/dsh-anchored-subagent) — DS的伟哥补丁，subagent都能满血！
- [dsh-anchored-wsl](https://github.com/dHR-P/dsh-anchored-wsl) — Two-phase DeepSeek Harness preset: first turn = official Minimal mode (We-chain anchor), then full Standard tools on Windows (Git Bash / WSL). 首轮极简锚定 + 第二轮标准工具
- [dsh-animation-principles](https://github.com/uckkk/dsh-animation-principles) — 迪士尼动画12法则知识库
- [dsh-annotation-plugin](https://github.com/boboozeng/dsh-annotation-plugin) — boboozeng/dsh-annotation-plugin discovered from GitHub.
- [dsh-answer-sound](https://github.com/zl99103/dsh-answer-sound) — Agent answer sound effects for the DeepSeek Harness web GUI: start/done/error tones following the answering lifecycle, per-kind volume, custom audio files, master switch.
- [dsh-anthropic-fonts](https://github.com/Isilsolme/dsh-anthropic-fonts) — Isilsolme/dsh-anthropic-fonts discovered from GitHub.
- [dsh-antigravity-auth](https://github.com/UE-DND/dsh-antigravity-auth) — DeepSeek Hardness 插件，用于在 DSH 中使用 Antigravity 提供的模型
- [dsh-any-attachment](https://github.com/Zenjibad/dsh-any-attachment) — dsh bundle: attach any file type in the DeepSeek Harness Web UI — text-likes inline, binaries as workspace path references, rasters via the built-in pipeline
- [dsh-anywhere-web](https://github.com/CsBpRd/dsh-anywhere-web) — CsBpRd/dsh-anywhere-web discovered from GitHub.
- [dsh-APEX_Plugin](https://github.com/GTC2080/dsh-APEX_Plugin) — Experimental APEX plugin for DeepSeek Harness: Minimal-anchored bootstrap with on-demand Standard tools.
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
- [dsh-arbitrary-host](https://github.com/FairyScript/dsh-arbitrary-host) — FairyScript/dsh-arbitrary-host discovered from GitHub.
- [dsh-arcaea-theme](https://github.com/a1swg1159-pixel/dsh-arcaea-theme) — An original Arcaea-inspired high-key prismatic UI theme plugin for DeepSeek Harness.
- [dsh-archify](https://github.com/GongYuanCaiJi/dsh-archify) — DeepSeek Harness 插件：用 JSON 规格生成可验证的架构图、流程图、时序图、数据流图与生命周期图（移植自 tt-a1i/archify）
- [dsh-archive-manager](https://github.com/jasonrale/dsh-archive-manager) — Archive panel for DSH WebUI: reopen, unarchive, or permanently delete sessions — with search and native-feel UI
- [dsh-archive-manager](https://github.com/MichengAI/dsh-archive-manager) — DSH Archive Manager 基于 DeepSeek Harness 的归档会话管理插件
- [dsh-archive-manager](https://github.com/Saikel-Orado-Liu/dsh-archive-manager) — Archived-session management (show/unarchive/permanently delete) for the DSH Web GUI, with zero changes to official packages.
- [dsh-archive-manager](https://github.com/Ycet/dsh-archive-manager) — DSH 设置新增「归档」页：按工作区分组查看已归档会话，支持筛选/排序、取消归档、二次确认彻底删除。Add an Archive page to DSH Settings: view archived sessions grouped by workspace, filter/sort, unarchive, and permanently delete one or all with confirmation.
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
- [dsh-at-github](https://github.com/bitxeno/dsh-at-github) — GitHub issue and pull request references for the DeepSeek Harness web GUI
- [dsh-at-mention](https://github.com/ShiraGawaAnri/dsh-at-mention) — DSH 配置档插件(profile bundle):像 Claude Code / Codex Desktop 一样,在输入框输入 `@` 提及**当前会话所在工作区**的文件/目录,支持带优先级的模糊搜索与键盘补全。
- [dsh-atlascloud](https://github.com/AtlasCloudAI/dsh-atlascloud) — Atlas Cloud skills and opt-in MCP tools for DeepSeek Harness
- [dsh-attachment-formats](https://github.com/genusamblyrhynchusbrunooftoul602/dsh-attachment-formats) — Extend DeepSeek Harness composer to accept PDFs and more attachment formats Codex-style, with zero core changes and native pipeline reuse.
- [dsh-attachment-formats](https://github.com/linkingoscar/dsh-attachment-formats) — Codex-style attachment formats for the DeepSeek Harness Web GUI: PDF text-layer extraction, Office text extraction, scanned-PDF OCR, long-document spill + index cards, image-to-PNG.
- [dsh-attachments](https://github.com/WJZ-P/dsh-attachments) — DeepSeek Harness plugin. 支持直接把图片、文件等拖入到dsh中。更方便地拖拽；image & file drop.
- [dsh-atuin](https://github.com/RealAlexandreAI/dsh-atuin) — dsh atuin-history: record dsh user prompts into atuin shell history
- [dsh-audio-alert](https://github.com/ellelkktrraaa/dsh-audio-alert) — dsh中断声音提示喵（可配置音频喵）Browser audio alerts for dsh attention edges: approval requests, ask-user questions, and finished turns.
- [dsh-audio-dub](https://github.com/pinch-eng/dsh-audio-dub) — Dub video and audio into 10 languages with voice cloning, from a DeepSeek Harness agent | DSH 视频/音频配音插件
- [dsh-audit-bundle](https://github.com/dongsheng123132/dsh-audit-bundle) — Content-addressed audit indexes across independent DeepSeek Harness evidence producers
- [dsh-aura-scheduler](https://github.com/ljsysfurryACE/dsh-aura-scheduler) — Proactive scheduling for DeepSeek Harness: Aura heartbeat + value network (official is model-driven only)
- [dsh-aurora-skin](https://github.com/breaker505/dsh-aurora-skin) — Three hand-tuned skins for DeepSeek Harness (DSH): Aurora (deep navy + electric cyan + warm coral), Paper (cool white + deep teal), and Hologram (near-black + lime-cyan). Pure --dsw-alias-* tokens, no core patches.
- [dsh-auth](https://github.com/radaren/dsh-auth) — radaren/dsh-auth discovered from GitHub.
- [dsh-auth-everying](https://github.com/chenbin-dev/dsh-auth-everying) — 导入本地 Claude、Codex、Grok、Gemini、Copilot、OpenCode 与 CC Switch 配置。 为支持的官方供应商提供 OAuth 登录。 从 OpenAI 兼容网关的 /v1/models 与 /models 发现 CC Switch 模型。
- [dsh-auth-gate](https://github.com/jiang539/dsh-auth-gate) — DSH Web UI 的认证门禁插件，提供 SVG 图形验证码与防暴力破解保护
- [dsh-auth-gate](https://github.com/TecFancy/dsh-auth-gate) — Login gate for the DeepSeek Harness (dsh) web surface: password or shared-token authentication, session cookies, rate limiting, and a user-management CLI. | DeepSeek Harness (dsh) 网页版登录门插件:账号口令或共享令牌认证、会话 cookie、登录限速,附用户管理 CLI。
- [dsh-auth-proxy](https://github.com/wxyzh/dsh-auth-proxy) — wxyzh/dsh-auth-proxy discovered from GitHub.
- [dsh-auth-tunnel](https://github.com/ai-eks/dsh-auth-tunnel) — Password-gated Cloudflare Tunnel access for the DeepSeek Harness Web GUI, with quick and named tunnel modes.
- [dsh-authorize-app](https://github.com/extension-hunter/dsh-authorize-app) — DeepSeek Harness plugin: a 'Connected Apps' settings section — a central platform where other DSH plugins surface themselves.
- [dsh-auto-approval](https://github.com/SipengXie2024/dsh-auto-approval) — LLM-gated auto approval for DeepSeek Harness: a model judges every approval ask first, low-risk operations pass without prompting (fail-closed)
- [dsh-auto-approval-plugin](https://github.com/StyxNether/dsh-auto-approval-plugin) — Trusted Auto: a middle permission tier for DeepSeek Harness between workspace-write and danger-full-access, auto-approving harmless commands and trusted-area targets
- [dsh-auto-classifier](https://github.com/PAKIKNOWLEDGE/dsh-auto-classifier) — PAKIKNOWLEDGE/dsh-auto-classifier discovered from GitHub.
- [dsh-auto-coding](https://github.com/facai0316/dsh-auto-coding) — 一个代码流水线，前期磨合好了以后，会有个很舒服的 vibe coding 体验，也可以更好的把闲时 token 利用起来（白天人肉测试+写需求+审核前一天的计划和决策，晚上让流水线自己挂着跑）
- [dsh-auto-collapse](https://github.com/a179-sanae/dsh-auto-collapse) — a179-sanae/dsh-auto-collapse discovered from GitHub.
- [dsh-auto-continue](https://github.com/Aki2519/dsh-auto-continue) — Aki2519/dsh-auto-continue discovered from GitHub.
- [dsh-auto-fold-turn](https://github.com/ycp424c/dsh-auto-fold-turn) — ycp424c/dsh-auto-fold-turn discovered from GitHub.
- [dsh-auto-goal-resume](https://github.com/tmeeli/dsh-auto-goal-resume) — DeepSeek Harness 插件:重启后自动续跑有活跃目标(goal)的会话,无需人工说继续。
- [dsh-auto-memory](https://github.com/1304836815/dsh-auto-memory) — DSH 会话级记忆插件：收尾提醒 + MEMORY.md 记忆索引维护 + 实时对话日志 + LLM 摘要压缩，配置面板在 设置→插件。Session memory for DeepSeek Harness.
- [dsh-auto-model](https://github.com/AL-spiritphoenix/dsh-auto-model) — AL-spiritphoenix/dsh-auto-model discovered from GitHub.
- [dsh-auto-model-router](https://github.com/JianTG/dsh-auto-model-router) — 根据问题复杂度自动切换模型
- [dsh-auto-open-web](https://github.com/jinsiyu/dsh-auto-open-web) — deepseek harness自动打开浏览器插件，内置WebView2程序实现轻量级桌面化。DeepSeek Harness automatically opens browser plugins and includes a built-in WebView2 program to achieve a lightweight desktop experience.
- [dsh-auto-review](https://github.com/AtropinolTT/dsh-auto-review) — DSH Auto Mode — native security review plugin for DeepSeek Harness: pre-execution rule interception + delivery-time independent subagent review. Built for long-running agents.
- [dsh-auto-reviewer](https://github.com/AntaresCorn/dsh-auto-reviewer) — 为 DeepSeek Harness 提供类似 Codex Auto Reviewer / "approve for me" 的权限模式。A permission mode for DeepSeek Harness similar to Codex Auto Reviewer / "approve for me"
- [dsh-auto-update](https://github.com/frostming/dsh-auto-update) — Startup auto-updater for DeepSeek Harness (dsh): checks the npm registry once on boot and optionally installs newer versions.
- [dsh-autocount-cloud](https://github.com/teckyuen/dsh-autocount-cloud) — DeepSeek Harness tools for AutoCount Cloud connector commands.
- [dsh-autogate](https://github.com/wangxing-git/dsh-autogate) — DeepSeek Harness 自动审批插件：在 workspace-write 沙箱之上叠加确定性规则 + LLM 安全审批，自动模式不放宽沙箱、fail-closed。 Safe auto-approval for DeepSeek Harness — deterministic rules + LLM review on top of the workspace-write sandbox. Auto mode without ever granting full-access.
- [DSH-AutoLab](https://github.com/Brain2nd/DSH-AutoLab) — DeepSeek Harness (DSH) AutoLab 插件：自治研究控制器 + 本地会话通信 —— 沿袭 DSH 极致内核，高缓存命中、高性能低成本
- [dsh-autonomy](https://github.com/abab996/dsh-autonomy) — DSH 自主性切换器：五档滑块按会话调节模型自主性（严格遵循 → 天马行空），提示词注入即时生效、每会话独立记忆
- [dsh-autonomy](https://github.com/JinkaiLiu/dsh-autonomy) — Switch between Chat and Agent without leaving your DeepSeek Harness session.
- [dsh-autopilot](https://github.com/245678000000/dsh-autopilot) — Acceptance-driven autonomous completion for DeepSeek Harness. Done means verified.
- [dsh-auxiliary](https://github.com/dsh-plugins/dsh-auxiliary) — Auxiliary models for DeepSeek Harness: vision understanding and context compression through dedicated model routes.
- [dsh-background](https://github.com/luoyu-xingu/dsh-background) — DeepSeek Harness Web 背景图片插件:本地图片路径替换网页背景,外观设置行 + 实时预览
- [dsh-backup-sync](https://github.com/csiroqa/dsh-backup-sync) — DeepSeek Harness（DSH）备份/恢复 + 跨机同步插件：本地快照、WebDAV 推送/拉取、自动备份与失效归档清理。Snapshot backup, restore and cross-machine sync plugin for DeepSeek Harness: local snapshots, incremental WebDAV push/pull, auto-backup retention and stale archive sweep.
- [dsh-balance](https://github.com/305037991x-pixel/dsh-balance) — DeepSeek account balance chip for DeepSeek Harness Web: 3-min auto refresh with total/topped-up/granted breakdown
- [dsh-balance](https://github.com/deepforce/dsh-balance) — DSH plugin: /balance command, composer-dock balance readout with top-up link, session-cost estimate
- [dsh-balance](https://github.com/mxl2498/dsh-balance) — DSH Web 插件：悬浮显示 DeepSeek 账户余额，点击直达充值页 | DSH widget showing your DeepSeek balance with a top-up link
- [dsh-balance](https://github.com/Mystery-God/dsh-balance) — 模型账户余额悬浮窗插件 for DeepSeek Harness Web GUI — floating model-account balance monitor with a settings master switch
- [dsh-balance](https://github.com/qiuyongjin/dsh-balance) — DSH plugin: query and display the DeepSeek account balance (dsh_balance tool + web UI widget)
- [dsh-balance](https://github.com/Shawnxxboxx/dsh-balance) — DSH plugin: show DeepSeek account balance below the conversation · 在对话下方显示 DeepSeek 账户余额
- [dsh-balance](https://github.com/Yogioo/dsh-balance) — Yogioo/dsh-balance discovered from GitHub.
- [dsh-balance-bubble](https://github.com/Jescoi/dsh-balance-bubble) — A floating DeepSeek account-balance bubble for the DSH web UI — glassy, draggable, low-balance alert, dark-mode ready.
- [dsh-balance-display](https://github.com/Liu-ty/dsh-balance-display) — DeepSeek API balance overlay for DeepSeek Harness
- [dsh-balance-display](https://github.com/xsuas/dsh-balance-display) — DeepSeek Harness 余额显示插件
- [dsh-balance-display](https://github.com/zhangjianyu1006156/dsh-balance-display) — DeepSeek API 余额显示插件：左下角余额胶囊、低余额预警、余额趋势、一键充值。密钥不出主机端。
- [dsh-balance-float](https://github.com/lingruan28-boop/dsh-balance-float) — DeepSeek API 余额悬浮窗：打开 Harness 即显示，可拖动缩放，放大查看官方用量 | A floating DeepSeek balance & usage widget for DeepSeek Harness (DSH)
- [dsh-balance-float](https://github.com/x2802490130-prog/dsh-balance-float) — DSH 悬浮余额/一键退出插件
- [dsh-balance-guard](https://github.com/DosterBool/dsh-balance-guard) — DeepSeek Harness 插件：状态栏实时余额 + 本会话花费追踪 + 低余额暂停输出并引导充值
- [dsh-balance-meter](https://github.com/healing1/dsh-balance-meter) — healing1/dsh-balance-meter discovered from GitHub.
- [dsh-balance-monitor](https://github.com/Rainronin/dsh-balance-monitor) — 一个好看、简单、实用的余额监视器｜DeepSeek Harness 插件：官方余额快照 + ds_balance 工具 + 峰谷计价区间 + Matrix/原生双风格徽章
- [dsh-balance-plugin](https://github.com/r0bert001/dsh-balance-plugin) — Deepseek Harness插件，支持实时展示deepseek余额
- [dsh-balance-stats](https://github.com/pangzi499/dsh-balance-stats) — Balance, session cost, token usage, and invoice summaries for DeepSeek Harness Web.
- [dsh-balance-tide](https://github.com/huanyuLv/dsh-balance-tide) — DeepSeek Harness (DSH) Web 插件: 余额 + 峰谷计价潮汐提示。显示 DeepSeek 账户余额与本会话花费, 并在余额前提示当前峰/谷价格档位、距切换倒计时与使用建议。
- [dsh-balanced-search](https://github.com/tianmingwan/dsh-balanced-search) — Balanced web search plugin/MCP server for DeepSeek Harness: Keenable / Exa / Tavily round-robin with failover. / 均衡搜索插件：Keenable / Exa / Tavily 轮流调用，自动故障切换。
- [dsh-ballute](https://github.com/Zlyraz/dsh-ballute) — Zlyraz/dsh-ballute discovered from GitHub.
- [dsh-baoyu-skills](https://github.com/GongYuanCaiJi/dsh-baoyu-skills) — 宝玉技能库（移植自 JimLiu/baoyu-skills）
- [dsh-base64url](https://github.com/uckkk/dsh-base64url) — Base64URL 编解码
- [dsh-bash-rtk](https://github.com/DeepTrial/dsh-bash-rtk) — DeepSeek Harness bash executor plugin that routes eligible commands through rtk (Rust Token Killer) to compress tool output and save tokens.
- [DSH-Basic-Right-Sidebar](https://github.com/xinspark/DSH-Basic-Right-Sidebar) — Basic Right Sidebar — a right sidebar plugin for DeepSeek Harness: two-level navigation (Functions / Sessions), workspace/session breadcrumb, session overview with log download, native trajectory view, and configurable topbar decluttering.
- [dsh-Basics-Panel](https://github.com/yxsj245/dsh-Basics-Panel) — DSH Web 插件「基础能力面板」：在 DSH 设置中可视化并管理 MCP 服务器、技能 与 规则。采用模块化 feature 注册表，后续的 DSH 可视化功能只需新增一个 feature 目录并在注册表加一行即可，无需改动面板骨架。
- [dsh-batch-regression](https://github.com/PangYiMing/dsh-batch-regression) — DSH plugin: run a command N rounds, judge by median/distribution — 批量回归取统计结论
- [dsh-beacons](https://github.com/Da-Mie/dsh-beacons) — Right-edge prompt navigator (Codex/OpenChamber-style scrub rail with scroll-spy) plus Windows toast notifications — a DeepSeek Harness plugin
- [dsh-bell-notify](https://github.com/Laplace-bit/dsh-bell-notify) — DeepSeek Harness (dsh) 社区插件：为 Agent 生命周期事件合成铃声 + 右下角呼吸状态点，每个事件可上传自定义音频。dsh plugin that rings bells and shows a breathing status dot for Agent lifecycle events.
- [dsh-benchmark](https://github.com/dongsheng123132/dsh-benchmark) — Deterministic revision-pinned benchmarks and regression evidence for DeepSeek Harness
- [dsh-better-chat-history](https://github.com/echo-xianyu/dsh-better-chat-history) — A plugin for DSH to optimize session loading speed and reduce disk read/write consumption.
- [dsh-better-codex-subagent](https://github.com/ivwumupy/dsh-better-codex-subagent) — ivwumupy/dsh-better-codex-subagent discovered from GitHub.
- [dsh-better-markdown](https://github.com/zerob13/dsh-better-markdown) — DeepSeek Harness Web plugin powered by markstream-react for resilient streaming Markdown, Mermaid diagrams, KaTeX math, and safe renderer fallback.
- [dsh-better-model-selector](https://github.com/Khellendros97/dsh-better-model-selector) — 将模型选择器和思考强度选择器拆成两个组件，并替换为更合理的交互方式
- [dsh-better-plan-reviewer](https://github.com/Khellendros97/dsh-better-plan-reviewer) — 更好的plan确认窗口，可以替换执行模型、暂存计划
- [dsh-better-sidebar-lite](https://github.com/pixellover1433/dsh-better-sidebar-lite) — a simple plugin to improve web UX/UI for "Deepseek Harness (dsh)"
- [dsh-better-status](https://github.com/Yaing-Yan/dsh-better-status) — DeepSeek Harness 插件：把文本形式的会话统计（轮/步、LLM/工具耗时、首 token、tok/s、缓存命中、输入/输出 token）替换为页面右侧直观醒目的图表面板。
- [dsh-bgwall-plugin](https://github.com/hubo980205/dsh-bgwall-plugin) — hubo980205/dsh-bgwall-plugin discovered from GitHub.
- [dsh-bib](https://github.com/youyli03/dsh-bib) — Embed a controllable real-browser viewport inside DeepSeek Harness — shared by humans and AI agents via an Edge extension + local relay bridge.
- [dsh-bili-taskmaster](https://github.com/jokerwen666/dsh-bili-taskmaster) — 等你的小鲸鱼跑任务时随机播放b站视频，愉快做监工
- [dsh-bili-widget](https://github.com/pyf2818/dsh-bili-widget) — 🎬 DSH (DeepSeek Harness) B站悬浮看片插件：边 coding 边刷视频。推荐/热门/排行/搜索/关注UP主、自动连播、迷你模式、历史持久化
- [dsh-bilibili](https://github.com/moxingovo/dsh-bilibili) — DeepSeek Harness plugin: Bilibili video search, metadata, and subtitle transcripts (bilibili_search / bilibili_video / bilibili_subtitles) · DeepSeek Harness 插件:B 站视频检索、元数据与字幕文稿,匿名可用,可选 SESSDATA 解锁登录字幕
- [dsh-bill](https://github.com/Jannchie/dsh-bill) — DSH (DeepSeek Harness) plugin: per-session cost line + cost attribution report, priced by llm-pricing
- [dsh-billing](https://github.com/nianpangzhi233/dsh-billing) — DSH web GUI realtime billing monitor: token/cost metering, DeepSeek v4 peak pricing, balance anchoring, sidebar pill + settings page, billing_balance agent tool
- [dsh-billing](https://github.com/Wanbinyu/dsh-billing) — Wanbinyu/dsh-billing discovered from GitHub.
- [dsh-billing-glass](https://github.com/linkingoscar/dsh-billing-glass) — Liquid-glass billing overlay for the DeepSeek Harness Web GUI: provider balances, session cost, daily spend and token buckets. DeepSeek-first and extensible.
- [dsh-bio-genie](https://github.com/moonbowterfly/dsh-bio-genie) — 🧬 dsh bio analysis plugin for DeepSeek Harness — wish-style bioinformatics & biology analysis: Biopython-powered sequence analysis, genomics, zero-install Python env (uv+venv)
- [dsh-biomemory](https://github.com/KLRSL/dsh-biomemory) — 生物仿生记忆系统插件：Biomimetic memory for DeepSeek Harness — transparent Markdown memory, approval-gated writes, frozen snapshot injection
- [dsh-birdman-plugins](https://github.com/birdman1992/dsh-birdman-plugins) — Community plugins for DeepSeek Harness (DSH): model metadata autofill and workspace artifacts view.
- [dsh-bisect-debug](https://github.com/PangYiMing/dsh-bisect-debug) — DSH plugin: bisect bugs (code / boundary / commit) — 二分法定位 bug 根因
- [dsh-blackhole](https://github.com/Asaiuta/dsh-blackhole) — Asaiuta/dsh-blackhole discovered from GitHub.
- [dsh-blackjack](https://github.com/WhiseNT/dsh-blackjack) — 谁不想coding的时候急头白脸的和大肥鱼来一场紧张刺激的21点呢
- [dsh-blue-archive-shiroko](https://github.com/mldhao/dsh-blue-archive-shiroko) — Blue Archive-inspired DSH theme with a Shiroko desktop companion, Codex-style reply bubbles, petting effects, and completion chime.
- [dsh-blue-whale-maid](https://github.com/yuxino/dsh-blue-whale-maid) — 运行在 deepseek harness 上的女仆酱
- [dsh-bottom-stats](https://github.com/318197375/dsh-bottom-stats) — DSH plugin: full-width conversation stats line (no truncation) + context occupancy progress bar for the DeepSeek Harness web UI
- [dsh-bridges](https://github.com/yhlooo/dsh-bridges) — 将 DeepSeek Harness 桥接到已配置其它 Harness Agent 的项目。支持 CodeBuddy / Codex / OpenCode / Claude Code / ...
- [dsh-bring-local-llm](https://github.com/Hed1an/dsh-bring-local-llm) — 让本地 LLM(Ollama/KoboldCpp/LM Studio/任意 OpenAI 兼容端点)接入 DeepSeek Harness，本地优先处理一部分信息，难点交给云端主模型：省在线 token、用上本地冗余算力。
- [dsh-browser](https://github.com/ben7am1n/dsh-browser) — Playwright-powered browser automation for DeepSeek Harness
- [dsh-browser](https://github.com/duyefeng/dsh-browser) — 给 DeepSeek Harness 的浏览器插件：AI 直接开真实的 Edge 浏览器逛网页、点击、填表、截图，无需 CDP 或 MCP。
- [dsh-browser-bridge](https://github.com/ycp424c/dsh-browser-bridge) — Prompt-scoped bridge between DSH and explicitly attached Chrome tabs
- [dsh-browser-control](https://github.com/kyo615/dsh-browser-control) — Let an AI control a real visible Chrome browser via Playwright MCP, with a live view of every action inside the DeepSeek Harness GUI.
- [dsh-browser-control](https://github.com/PangYiMing/dsh-browser-control) — DSH plugin for controlling browsers (CDP/Playwright) — DeepSeek Harness 操控浏览器插件
- [dsh-browser-fs](https://github.com/whitefirer/dsh-browser-fs) — dsh（DeepSeek Harness）插件：让 agent 读写浏览器所在机器的本地文件——File System Access 授权 + WS 中继，含非安全上下文兼容模式
- [dsh-browseruse](https://github.com/yzd6552-commits/dsh-browseruse) — browser-use style browser automation plugin for DeepSeek Harness: drives a dedicated Chrome instance (persistent profile) via playwright-core — fine-grained tools, autonomous tasks, scheduling, dangerous-action confirmation, captcha hand-off
- [dsh-budget](https://github.com/PerryLink/dsh-budget) — Cost governance for DeepSeek Harness: aggregated token/cost metering per model, session and day, budget caps with threshold alerts and over-limit policies, carbon footprint estimation, per-model latency benchmarks, a Settings budget tab, and the /budget command
- [dsh-build-diff](https://github.com/KeLearns/dsh-build-diff) — Agent-loop change review for the DeepSeek Harness web GUI
- [dsh-bundle-updater](https://github.com/hyls9527/dsh-bundle-updater) — DSH 整合包插件管理器：检查更新 / 搜索 / 安装 / 卸载 / 安全审计（npm / GitHub / 本地链接）｜Full-lifecycle plugin manager for DSH profile bundles
- [dsh-bundle-vision](https://github.com/skillre/dsh-bundle-vision) — Zero-core-change vision capability for DeepSeek Harness: the describe_image tool + profile bundle, installable via 'dsh plugin add'
- [dsh-butler-memory](https://github.com/AndyYang12345/dsh-butler-memory) — A dsh plugin that uses the butler memory mcp server to achieve better and organized memory for dsh. Long term and short term memories seperated.
- [dsh-byte-size](https://github.com/uckkk/dsh-byte-size) — 字节大小格式化
- [dsh-cache-hit-decimal](https://github.com/Yuuu0109/dsh-cache-hit-decimal) — Two-decimal cache-hit rate for the DeepSeek Harness Web GUI
- [DSH-Cache-Hit-Precision](https://github.com/luern0313/DSH-Cache-Hit-Precision) — dsh状态栏显示两位小数缓存命中率
- [dsh-cache-miss](https://github.com/wefio/dsh-cache-miss) — 在cache miss的时候提示
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
- [dsh-cbx-orch](https://github.com/zerosloney/dsh-cbx-orch) — Durable coding-agent orchestrator as a DeepSeek Harness plugin: dispatch tasks to codebuddy/opencode/omp/cline/qwen with persistent jobs, queue, review, and rollback.
- [dsh-cc-ecosystem](https://github.com/Bcy2020/dsh-cc-ecosystem) — 让 DeepSeek Harness 用上 Claude Code 全家桶:技能、命令、规则、权限、子代理、hooks—— .claude/ 资产原样加载,正在逐步做到全兼容。
- [dsh-cc-haha-memory](https://github.com/yihefeikong-rgb/dsh-cc-haha-memory) — CC-HAHA-inspired persistent memory plugin for DeepSeek Harness (DSH)
- [dsh-cc-import](https://github.com/Mreate/dsh-cc-import) — Import high-quality conversations into Claude Code and provide CLAUDE.md recognition, add basic features like the "/init" command, and help speed up migration progress | 高质量导入Claude Code中的对话，并提供CLAUDE.md识别，添加"/init"命令等基础功能，帮助快速迁移进度
- [dsh-cc-suite](https://github.com/AS17514/dsh-cc-suite) — AS17514/dsh-cc-suite discovered from GitHub.
- [dsh-cc-switch](https://github.com/LKRCharon/dsh-cc-switch) — Sync cc-switch provider profiles into DeepSeek Harness (DSH) model routes — CLI, slash command, and agent tool
- [dsh-cdp-browser](https://github.com/zaiwenJ/dsh-cdp-browser) — Zero-spawn CDP browser control plugin for DeepSeek Harness: screenshots, pixel assertions, page JS — no vision model, no per-use approval
- [dsh-chain-toggle-all](https://github.com/NekoDD-wow/dsh-chain-toggle-all) — DSH Web GUI plugin: one-click expand/collapse all reasoning chains and tool chains in the current session
- [dsh-chameleon](https://github.com/lsz-asd/dsh-chameleon) — lsz-asd/dsh-chameleon discovered from GitHub.
- [dsh-change-attestor](https://github.com/MkaliezZ/dsh-change-attestor) — Deterministic workspace-change attestation for DeepSeek Harness: compares bounded snapshots and reports created, changed, and removed paths.
- [dsh-change-center](https://github.com/Chance-Wu/dsh-change-center) — 文件变更的捕获 → 审查 → 拒绝 / 应用 → 回滚中心
- [dsh-change-review](https://github.com/cirelir/dsh-change-review) — DeepSeek Harness 会话修改审查插件：追踪会话内 write/edit，diff 对比展示，会话隔离/子代理聚合/SSE 实时推送/颜色自定义
- [dsh-changelog](https://github.com/GongYuanCaiJi/dsh-changelog) — 自动生成发布说明（移植自 @noice-tech/pi-changelog）
- [dsh-changes-panel](https://github.com/szh1007/dsh-changes-panel) — szh1007/dsh-changes-panel discovered from GitHub.
- [dsh-channel-telegram](https://github.com/LosEcher/dsh-channel-telegram) — DSH bundle: thin Telegram bridge (long-poll Bot API, allowlist, per-chat agent sessions) for DeepSeek Harness
- [dsh-channels](https://github.com/wsz987/dsh-channels) — 把微信 / QQ / 钉钉 / 飞书接入 DeepSeek Harness：统一配置、扫码授权，在各 IM 里直接和你的 Agent 对话
- [dsh-chat-content-visibility-auto](https://github.com/hongweifei/dsh-chat-content-visibility-auto) — DeepSeek Harness 聊天列表性能优化：为消息节点启用 content-visibility:auto，跳过屏外节点渲染/布局/绘制；DSH plugin: content-visibility:auto windowing for the chat list, smoother scrolling in long conversations.
- [dsh-chat-focus](https://github.com/supergameboy/dsh-chat-focus) — dsh web conversation plugin: fold runtime activity into expandable boxes, chat bubbles, deep customization (fork of dsh-client-ui-conversation)
- [dsh-chat-imagine](https://github.com/corrinehu/dsh-chat-imagine) — 在 DSH 聊天窗口自动调用生图工具（API 渠道，或本机 CLI：已支持mmx / codex / agy）并展示图片。
- [dsh-chat-index-rail](https://github.com/Mobai-read/dsh-chat-index-rail) — Chat input index rail for DeepSeek Harness Web UI
- [dsh-chat-link](https://github.com/KeFan-J/dsh-chat-link) — Peer-to-peer conversation linking for DeepSeek Harness (DSH): @-mention any session, wake it up, chat across conversations. Type @ in the composer, pick a session, send — the target agent is woken via agent.send. Persistent message board, native-feel inbox panel, 5 chat_link_* tools. dsh-plugin.
- [dsh-chat-manager](https://github.com/tvrpdfe/dsh-chat-manager) — DeepSeek Harness (DSH) Web UI 会话管理插件
- [dsh-chat-nav](https://github.com/c-v-c-v/dsh-chat-nav) — DeepSeek Harness 聊天快捷导航插件（ChatGPT 式悬停滑出）· A DeepSeek Harness chat quick-nav plugin (ChatGPT-style hover slide-out)
- [dsh-chat-tidy](https://github.com/ChuanTianML/dsh-chat-tidy) — Restrained chat typography and layout for DeepSeek Harness Web
- [dsh-chat-toc](https://github.com/a792883583/dsh-chat-toc) — DSH web GUI chat table-of-contents: outline bar on the right edge of the conversation, hover to expand, click to jump
- [dsh-chat-width](https://github.com/AnakinCao/dsh-chat-width) — DSH Web GUI plugin: adaptive chat content width — the middle area expands with screen resolution (1080p/2K/4K) when side panels are collapsed (injects CSS overriding --dsh-chat-content-width)
- [dsh-chat-width-customizer](https://github.com/magicOF2/dsh-chat-width-customizer) — magicOF2/dsh-chat-width-customizer discovered from GitHub.
- [dsh-chat-window-fold](https://github.com/dove-a/dsh-chat-window-fold) — DSH web GUI plugin: auto fold/expand the chat window — bottom checkpoints hide old pages, top-scroll expands earlier messages with the viewport anchored.
- [dsh-chatfile](https://github.com/sooya7/dsh-chatfile) — sooya7/dsh-chatfile discovered from GitHub.
- [dsh-chatflow-rail](https://github.com/veritas501/dsh-chatflow-rail) — Conversation-flow navigation rail for the dsh web GUI — one dash per user message with hover previews and smooth jumps, plus a docked "previous message" card.
- [dsh-chatgpt-codex](https://github.com/sudipnext/dsh-chatgpt-codex) — ChatGPT OAuth and Codex models for DeepSeek Harness — browser callback, device code, no API key, no pi-ai
- [dsh-chatgpt-subscription](https://github.com/Aa728848/dsh-chatgpt-subscription) — Aa728848/dsh-chatgpt-subscription discovered from GitHub.
- [dsh-chatgpt-subscription](https://github.com/songoao25/dsh-chatgpt-subscription) — ChatGPT Subscription - a DeepSeek Harness plugin: bind your ChatGPT account via official OAuth and chat with ChatGPT models inside DSH, using your Plus/Pro subscription quota
- [dsh-chatpaper](https://github.com/puppet2004/dsh-chatpaper) — puppet2004/dsh-chatpaper discovered from GitHub.
- [dsh-chatvoice](https://github.com/FuzzySoul/dsh-chatvoice) — ChatVoice — free voice input + AI reply read-aloud for DeepSeek Harness (dsh). 零配置/零成本/免 API key 语音插件
- [dsh-cheatengine](https://github.com/TindalosKorone/dsh-cheatengine) — DSH plugin bridging DeepSeek Harness agents to Cheat Engine: dynamic debugging, memory scanning, pointer analysis, breakpoints, and game memory hacking via ce_* tools.
- [dsh-check-update](https://github.com/HuiHuitie-zhu/dsh-check-update) — HuiHuitie-zhu/dsh-check-update discovered from GitHub.
- [dsh-checkpoint](https://github.com/dpskh/dsh-checkpoint) — Mark an exploration start in the session; pairs with rewind to fold the exploration out of context.
- [dsh-checkpoint-diff](https://github.com/tmpdot/dsh-checkpoint-diff) — File-diff visualization between checkpoint time nodes for DeepSeek Harness: read-only timeline + per-file line diff over dsh-checkpoint-rewind checkpoints, as a /diff command, JSON HTTP API, and GUI panel.
- [dsh-chess-xq](https://github.com/feverZHONG/dsh-chess-xq) — feverZHONG/dsh-chess-xq discovered from GitHub.
- [dsh-chime](https://github.com/HtO404/dsh-chime) — Task-completion notification chime for the DSH web GUI: beeps when an agent turn finishes, even in background tabs. 10 preset sounds + custom import + volume.
- [dsh-chime](https://github.com/Mystery-God/dsh-chime) — 任务完成提示音插件 for DeepSeek Harness Web GUI — task-completion chime, volume control, custom audio, Plugins settings page
- [dsh-chinese-mode](https://github.com/dawnliming/dsh-chinese-mode) — DSH global Chinese-mode toggle: a 中 switch in the input box; when on, a Simplified-Chinese requirement is injected into every session system prompt.
- [dsh-chinese-thinking](https://github.com/GongYuanCaiJi/dsh-chinese-thinking) — DeepSeek Harness 插件：让 agent 默认用中文思考与回复（移植自 superpowers-zh）
- [dsh-chinese-thinking](https://github.com/Max-Null/dsh-chinese-thinking) — Max-Null/dsh-chinese-thinking discovered from GitHub.
- [dsh-chrome](https://github.com/stuarthu/dsh-chrome) — DeepSeek Harness (dsh) browser companion: Chrome side panel embedding the full dsh web UI + host plugins for page reading, HTTP capture, and browser control.
- [dsh-chrome](https://github.com/YJSoooooo/dsh-chrome) — Chrome profile bridge for DeepSeek Harness: control an existing signed-in Chrome profile through chrome_repl.
- [DSH-Chrome-devtools](https://github.com/yuzi-ska/DSH-Chrome-devtools) — Real Chrome browser control for DeepSeek Harness agents, powered by Chrome DevTools MCP
- [dsh-ci-cd-bot](https://github.com/bkMoon1024/dsh-ci-cd-bot) — bkMoon1024/dsh-ci-cd-bot discovered from GitHub.
- [dsh-ci-co-pilot](https://github.com/temotee2103/dsh-ci-co-pilot) — GitHub CI co-pilot for DeepSeek Harness: PR review, CI failure fixing, issue triage and release notes. Everything is a plugin.
- [dsh-ci-context](https://github.com/lucas-ward/dsh-ci-context) — Privacy-focused CI execution context for DeepSeek Harness agents
- [dsh-ci-doctor](https://github.com/jkrandom-sudo/dsh-ci-doctor) — CI failure, diagnosed before you open the logs — DeepSeek Harness plugin that watches GitHub Actions for new failures and turns raw logs into structured diagnosis cards · CI 失败，打开日志前就完成诊断 —— DSH 插件：监视 GitHub Actions 新失败，原始日志转结构化诊断卡，签名账本识别复发问题
- [dsh-cinematic-workflow](https://github.com/luoyuejun9/dsh-cinematic-workflow) — luoyuejun9/dsh-cinematic-workflow discovered from GitHub.
- [dsh-cinematography](https://github.com/uckkk/dsh-cinematography) — 电影运镜与镜头语言参考
- [dsh-cite](https://github.com/STARDUSTLC666/dsh-cite) — STARDUSTLC666/dsh-cite discovered from GitHub.
- [dsh-claude-antidote](https://github.com/FolioTemp/dsh-claude-antidote) — DSH compatibility antidote: keep dsh-claude-ux visibly enabled while neutralizing its actual debuffs.
- [dsh-claude-cli](https://github.com/katsos/dsh-claude-cli) — DeepSeek Harness LLM provider that runs your installed Claude Code CLI as the model backend — no API key.
- [dsh-claude-code](https://github.com/Yuki-takuya-kun/dsh-claude-code) — Run Claude Code harness as the DeepSeek Harness main loop, streaming live trajectory into the DSH web UI.
- [dsh-claude-code](https://github.com/zhangjunjesse/dsh-claude-code) — zhangjunjesse/dsh-claude-code discovered from GitHub.
- [dsh-claude-code-templates](https://github.com/GongYuanCaiJi/dsh-claude-code-templates) — Claude Code 技能模板库（claude-code-templates 移植，897 个 SKILL.md）
- [dsh-claude-import](https://github.com/TimeCraker/dsh-claude-import) — Import Claude Code config (skills/rules/CLAUDE.md/AGENTS.md) into DeepSeek Harness, with destination preview, conflict strategies, and idempotent re-imports.
- [dsh-claude-in](https://github.com/ShinewineW/dsh-claude-in) — Read-only Claude Code compatibility bridge for DeepSeek Harness: Skills, Rules, command Hooks, and Agents from .claude as SSOT.
- [dsh-claude-marketplace](https://github.com/ben7am1n/dsh-claude-marketplace) — Claude Code marketplace compatibility for DeepSeek Harness
- [dsh-claude-mem](https://github.com/Bleed00/dsh-claude-mem) — DeepSeek Harness plugin integrating claude-mem (memory for dsh)
- [dsh-claude-migrator](https://github.com/huanghouchun/dsh-claude-migrator) — Claude → DeepSeek Harness (DSH) 配置迁移插件：自动识别用户主目录与项目根的 .claude/skills、.claude/rules、.mcp.json、CLAUDE.md，skill 按工作区隔离唤醒，MCP 动态注册真实连接，内置可折叠配置中心看板
- [dsh-claude-octopus](https://github.com/GongYuanCaiJi/dsh-claude-octopus) — multi-agent 编排（移植自 claude-octopus）
- [dsh-claude-provider](https://github.com/MoFeng2223/dsh-claude-provider) — Custom Claude provider support for DeepSeek Harness
- [dsh-claude-skills](https://github.com/GongYuanCaiJi/dsh-claude-skills) — 362 个技能库（移植自 alirezarezvani/claude-skills）
- [DSH-Claude-Style-Reasoning-Slider](https://github.com/MEMZ-JZY/DSH-Claude-Style-Reasoning-Slider) — DSH Claude Style Reasoning Slider is a DeepSeek Harness (DSH) client UI plugin that replaces the native model selector with a Claude-style animated reasoning-effort slider and model picker.DSH Claude Style Reasoning Slider 是一个面向 DeepSeek Harness（DSH）的客户端 UI 插件，用于将原生模型选择器替换为带 Claude 风格动画的推理等级滑块与模型选择器。
- [dsh-claude-theme](https://github.com/chajiuqqq/dsh-claude-theme) — dsh的claude风格界面
- [dsh-claude-tui](https://github.com/cogine-ai/dsh-claude-tui) — Claude-Code-Styled TUI for DeepSeek Harness
- [dsh-claude-ux](https://github.com/eri64/dsh-claude-ux) — DSH plugin: Claude-style Chinese risk control & conversation autonomy for DeepSeek Harness web
- [dsh-claudecode-tips](https://github.com/ldgeng/dsh-claudecode-tips) — 将deep diving替换为claudecode式的working tips
- [dsh-clawshell](https://github.com/jorinyang/dsh-clawshell) — ClawShell vision as DeepSeek Harness plugins: self-perception, closed-loop self-adaptation, trust/niche swarm, insight mining, knowledge genome
- [dsh-cli-workspaces](https://github.com/qingkong143/dsh-cli-workspaces) — DeepSeek Harness 插件：带工作区切换的命令行任务模式（-w 切换，ws 子命令管理）
- [dsh-click](https://github.com/PerryLink/dsh-click) — Cross-platform native desktop control for DeepSeek Harness (Windows first): screen_shot, screen_read, click/type/scroll/key, app_list/app_launch - approval-gated, never stealing foreground focus
- [dsh-client-deep-sneak](https://github.com/Rain-Shuoyu/dsh-client-deep-sneak) — DeepSneak（深度摸鱼）是专门为 DeepSeek Harness 设计的插件，在 agent 工作时播放 B 站视频，并在 agent 需要操作时暂停并提醒用户，方便摸鱼的同时避免因为没有发现 agent 被阻塞而影响效率
- [dsh-client-fix](https://github.com/labi43186-spec/dsh-client-fix) — DSH Desktop 客户端修复插件: 修复 pnpm shim 编码 + fs.watch 自动同步 web 向 desktop 对齐 + 预加 minimumReleaseAgeExclude。使用 DeepSeek-V4-Flash 制作。
- [dsh-client-plugin-manager](https://github.com/mccxs/dsh-client-plugin-manager) — DeepSeek Harness 客户端插件管理器：分组插件清单 + 插件市场标签页（dsh-client-plugin-manager）
- [dsh-client-shortcuts](https://github.com/blue-a11y/dsh-client-shortcuts) — Global keyboard shortcuts plugin for the DeepSeek Harness web GUI: ctx.shortcuts registry service + mod+l/mod+k/mod+shift+c default bindings
- [dsh-client-ui-filesystem](https://github.com/dsh-mixxed/dsh-client-ui-filesystem) — A customized DeepSeek Harness filesystem UI plugin.
- [dsh-client-ui-filesystem-manager](https://github.com/dsh-mixxed/dsh-client-ui-filesystem-manager) — A customized DeepSeek Harness filetree manager UI plugin.
- [dsh-client-ui-git-branch](https://github.com/dsh-mixxed/dsh-client-ui-git-branch) — A customized DeepSeek Harness git branch UI plugin.
- [dsh-client-ui-pet](https://github.com/LucasleeCN/dsh-client-ui-pet) — LucasleeCN/dsh-client-ui-pet discovered from GitHub.
- *其余 2555 个待分类插件未在此列出，可在[在线网站](https://deepseek1024.com/)搜索或浏览完整目录。*

</details>

## 免责声明

本项目是社区维护的插件索引。插件由各自作者开发和维护，收录不构成安全、质量或维护状态背书。安装插件会在本机运行第三方代码，请在安装前自行审阅源码和依赖。

## 许可证

本仓库采用分区许可：

- 应用、自动化与构建工具等源代码采用 [MIT License](LICENSE)。
- `catalog/` 下的插件目录元数据采用 [CC0-1.0](catalog/LICENSE)。
- 初始目录数据导入自 `awesome-dsh-plugin`，来源和导入提交见 [catalog/ATTRIBUTION.md](catalog/ATTRIBUTION.md)。

目录中列出的第三方插件不属于本仓库，其源代码分别遵循各自仓库的许可证。
