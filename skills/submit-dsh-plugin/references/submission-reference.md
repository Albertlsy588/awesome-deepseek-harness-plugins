# 提交参考

## 分类指南

选择最能代表插件主要用户价值的单一分类。

| ID | 适用范围 |
| --- | --- |
| `ui` | 输入框、侧边栏、对话界面和其他 UI 功能 |
| `theme` | 皮肤、颜色、字体排版和视觉外观 |
| `session` | 消息、历史记录、导航、导入导出和分享 |
| `memory` | 召回、持久上下文和知识保存 |
| `tools` | Agent 工具和外部能力 |
| `skill` | Skill 库、加载器、路由和 Skill 管理 |
| `workflow` | 自动化、编排、调度和 Agent 循环 |
| `notify` | 通知和第三方通信集成 |
| `model` | 模型提供商、凭据、路由、用量和计费 |
| `dev` | 开发工具、运行时、协议、调试和部署 |
| `fun` | 游戏、宠物和以娱乐为主要目的的插件 |

如果两个分类都合适，应按用户安装插件后获得的主要能力分类，而不是按内部实现分类。

## 元数据规则

- 只能使用以下字段：`$schema`、`id`、`name`、`repository`、`category`、`description`、`added`。
- `id` 为 `owner/repository`，monorepo 子包插件为 `owner/repository/sub/dir`：前两段之后的路径段指向仓库内子目录。各段仅限 `A-Za-z0-9_.-` 字符，路径段不得是 `.` 或 `..`，总长不超过 201 字符。
- 唯一性按完整 `id`（不区分大小写）判断：同一仓库可以以不同子目录路径出现在多个条目中，重复的 `id` 必须拒绝。
- 将 `repository` 固定为由 `id` 前两段推导的仓库根 URL `https://github.com/<owner>/<repository>`；子目录路径只出现在 `id` 中，绝不出现在 `repository` URL 里。
- `name` 默认取 `id` 的最后一段（两段 ID 即仓库名，子目录 ID 即子包目录名）。
- 根据完整 `id` 生成文件名：每个 `/` 分隔的段转为全小写、把连续的非字母数字字符替换成 `-`，再用 `--` 连接。示例：`owner/repository` → `<owner>--<repository>.json`；`owner/repository/packages/foo` → `owner--repository--packages--foo.json`。文件平铺在 `catalog/plugins/` 下。
- `id` 的路径段锁定插件源码位置：子目录 ID 的路径必须恰好指向声明 `dsh.bundle.patch` 的 `package.json` 所在目录（即 `<sub/dir>/package.json`）。
- 1024 Store 只提供 npm 安装。网站会探测该 manifest 声明的 npm 包名：latest npm manifest 存在且声明 `dsh.bundle` 时插件即可安装；npm manifest 的 `repository` 字段缺失或与目录仓库不一致均不影响验证。未发布 npm 包的插件以浏览模式收录，展示仓库链接、不展示安装命令。
- 保持 `description.en` 和 `description.zh` 客观、中性且具体。
- 避免最高级、号召性语言、排名、Star 数量以及仓库证据无法支持的宣传。
- `added` 使用提交日期。

## PR 正文模板

替换所有占位符，并填写真实的测试证据。摘要里的链接文本使用完整插件 ID，链接目标始终是仓库根 URL。`子目录` 一行仅子目录 ID 保留（其值等于 ID 前两段之后的路径），两段 ID 删除该行；子目录 ID 的 `Manifest` 必须恰好是 `<sub/dir>/package.json`。

自动审查失败时，PR 会保持打开以便继续推送修复，工作流永远不会自动关闭 PR；非草稿新增类 PR 通过后会自动 squash merge，并由 GitHub 记录为已合并。修改或删除既有条目的 PR 通过静态审查后不会自动合并，需等待维护者人工审核后手动合并。

仓库根 PR 模板中的 `Maintainer API compatibility` 段只适用于维护者应用/API 变更。
插件目录投稿保持该段全部未勾选，不得把目录投稿描述成 API 变更。

```markdown
## 摘要

将 [`<插件 ID>`](https://github.com/owner/repository) 添加到 DeepSeek Harness 插件目录。

## 插件验证

- Manifest：`<path>/package.json`
- 子目录：`<sub/dir>`（其 `<sub/dir>/package.json` 即插件 manifest；仅子目录 ID 保留本行）
- Bundle patch：`<path/to/patch>`
- 测试命令：`<实际执行的命令>`
- 测试结果：`<简洁的真实结果>`

## 目录提交确认

- [x] 本 PR 只新增一个 `catalog/plugins/*.json` 文件，不包含其他改动
- [x] 插件仓库声明了 `dsh.bundle.patch`，并已提交引用的补丁文件
- [x] 作者已经测试插件行为和兼容性
- [x] 插件仓库已添加 `dsh-plugin` topic
- [x] 中英文简介中性且准确
- [x] 我理解检查失败时 PR 会保持打开以便修复；非草稿 PR 通过后会自动合并，合并后由 CI 自动同步到网站目录与 README，且收录不代表对插件行为、安全性或质量的背书
```
