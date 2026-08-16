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
- 将 `repository` 固定为 `https://github.com/<id>`。
- 根据全小写 owner 和 repository 生成文件名，把连续的非字母数字字符替换成 `-`：`<owner>--<repository>.json`。
- 保持 `description.en` 和 `description.zh` 客观、中性且具体。
- 避免最高级、号召性语言、排名、Star 数量以及仓库证据无法支持的宣传。
- `added` 使用提交日期。

## PR 正文模板

替换所有占位符，并填写真实的测试证据。

自动审查失败时，PR 会保持打开以便继续推送修复，工作流永远不会自动关闭 PR；非草稿新增类 PR 通过后会自动 squash merge，并由 GitHub 记录为已合并。修改或删除既有条目的 PR 通过静态审查后不会自动合并，需等待维护者人工审核后手动合并。

```markdown
## 摘要

将 [`owner/repository`](https://github.com/owner/repository) 添加到 DeepSeek Harness 插件目录。

## 插件验证

- Manifest：`<path>/package.json`
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
