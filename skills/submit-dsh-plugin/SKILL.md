---
name: submit-dsh-plugin
description: 验证并提交 DeepSeek Harness 插件到 imsai-sh/awesome-deepseek-harness-plugins 社区目录。适用于插件作者要求收录、发布或提交自己的插件，创建目录 JSON，修复目录提交 PR，或者发起合规 PR。检查公开仓库、dsh-plugin topic、dsh.bundle.patch、作者测试证据、双语元数据和单文件差异，并在获得授权后执行 fork、push 和创建 PR。
---

# 提交 DSH 插件

从插件作者的仓库准备一份聚焦的目录收录 PR。始终把 `catalog/plugins/*.json` 视为贡献者唯一可以编辑的目录源数据。

## 安全与范围

- 不得在插件提交 PR 中编辑 `README.md`、`catalog/README.md`、生成的 registry、工作流或应用代码。
- 不得仅为了检查插件而安装依赖、运行生命周期脚本、构建或执行插件代码。运行作者代码前必须先征得同意。
- 保留所有无关的本地改动。如果目录仓库工作区不干净，应停止操作；除非用户指定一个干净 worktree，或明确界定现有改动的范围。
- 将“准备”或“起草”理解为仅做本地修改。只有用户明确要求“提交”“推送”或“创建 PR”时，才视为已授权在展示准确目标后执行 fork、push 和创建 PR。
- 不得合并 PR，也不得修改生成投影。插件被接受后，由维护者单独更新这些文件。

## 1. 明确提交信息

确定以下内容：

- 插件仓库 ID：`owner/repository`
- 插件名称，通常与仓库名一致
- 一个主要目录分类
- 客观的英文与中文简介
- 作者实际执行的测试命令和结果

目录仓库固定使用 `https://github.com/imsai-sh/awesome-deepseek-harness-plugins`。创建文件前，读取其当前 checkout 中的 `CONTRIBUTING.md` 和 `catalog/categories.json`；如果线上仓库规范与本 Skill 不同，以线上规范为准。

选择分类或编写 PR 时，读取 [references/submission-reference.md](references/submission-reference.md)。

## 2. 检查插件仓库

先完成只读检查：

1. 确认仓库公开且存在默认分支。
2. 确认仓库包含 `dsh-plugin` GitHub topic。如果缺少 topic、用户拥有该仓库且已授权外部写入，才可执行 `gh repo edit owner/repository --add-topic dsh-plugin`。
3. 查找插件使用的根目录或嵌套 `package.json`，排除 `node_modules`。
4. 确认其中声明了非空字符串 `dsh.bundle.patch`。
5. 相对于声明该字段的 `package.json` 解析补丁路径；拒绝绝对路径、反斜杠以及跳出仓库的路径。
6. 确认 manifest 和引用的补丁都存在于 GitHub 默认分支，而不只是尚未推送的本地提交。
7. 记录作者实际执行的兼容性测试。如果尚未测试，应停止并要求作者先测试；目录自动审查不会执行第三方代码。

使用 GitHub 或 `gh` 获取远程默认分支证据。不得用仅存在于本地的文件作为证明。

## 3. 准备干净的目录分支

优先复用干净的目录 checkout。仅本地准备时，直接克隆上游目录仓库，不创建 fork。已授权正式提交时，使用 GitHub CLI fork 并克隆，或者把用户已有的 fork 添加为推送 remote。保留上游仓库 remote，拉取其默认分支，然后创建聚焦分支，例如：

```text
add-owner-repository
```

不得把目录条目放进插件仓库。不得基于另一个尚未合并的贡献分支创建本次分支。

## 4. 创建目录条目

解析本 Skill 目录的绝对路径，然后运行其中的确定性创建脚本：

```bash
node <skill-directory>/scripts/create-catalog-entry.mjs \
  --catalog-root <catalog-checkout> \
  --id owner/repository \
  --category skill \
  --description-en "A factual English description." \
  --description-zh "客观、具体的中文说明。"
```

仅当展示名称需要不同于仓库名时传入 `--name`。仅当需要覆盖当天 UTC 日期时传入 `--added YYYY-MM-DD`。

脚本必须拒绝未知分类、重复仓库、无效 ID 和已存在的目标文件。不得绕过这些错误手工创建文件。

## 5. 验证单文件约束

要求当前分支相对上游最新默认分支的完整差异只包含一个新增文件：

```text
A catalog/plugins/<owner>--<repository>.json
```

然后执行以下检查：

1. 再次解析 JSON。
2. 确认文件名与规范化后的 `id` 一致。
3. 确认中英文简介客观、中性、具体，且有仓库证据支持。
4. 确认 `added` 是提交日期。
5. 只暂存该 JSON 文件，并运行 `git diff --cached --check`。
6. 检查暂存差异是否包含凭据、私有路径、邮箱、token 或无关数据。

如果可以针对已提交分支在本地运行目录仓库的可信审查脚本，应传入上游基础 SHA、当前分支 HEAD SHA、作为 `PLUGIN_REVIEW_ROOT` 的目录 checkout，以及已认证的 GitHub token。不得把该静态审查描述成插件运行测试。

## 6. 提交并创建 PR

使用聚焦的提交信息，例如：

```text
catalog: add owner/repository
```

推送前，说明 fork、分支、上游仓库和唯一暂存的文件。只有获得授权后才可推送并创建 PR。

使用 [references/submission-reference.md](references/submission-reference.md) 中的模板编写 PR，填写真实的测试命令和结果，并保持“允许维护者修改”开启。

## 7. 跟进自动检查

创建 PR 后：

1. 返回 PR URL。
2. 检查 `Plugin submission review / static-review` 及其机器人评论。
3. 在可用时检查 `CI / verify`。
4. 如果 GitHub 报告 `action_required`，说明需要维护者批准工作流；不得尝试绕过。
5. 仅通过修改目录 JSON 修复检查失败。不得为了通过检查而加入生成文件。

自动检查通过并不保证被收录。每个目录提交都必须由维护者人工审查和合并。

## 已存在的条目与更新

如果插件 ID 或仓库已经存在，应立即停止。贡献者 PR 只能新增条目；更新和删除属于维护者变更。应报告已有文件或 PR，不得创建重复条目。
