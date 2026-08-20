import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const script = path.join(root, 'skills/submit-dsh-plugin/scripts/create-catalog-entry.mjs')
const categories = {
  version: 1,
  categories: [
    { id: 'tools', order: 10, label: { en: 'Tools', zh: '工具' } },
    { id: 'skill', order: 20, label: { en: 'Skills', zh: '技能' } },
  ],
}

async function fixture(entries = []) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'submit-dsh-plugin-'))
  await mkdir(path.join(directory, 'catalog/plugins'), { recursive: true })
  await writeFile(path.join(directory, 'catalog/categories.json'), `${JSON.stringify(categories)}\n`)
  for (const [file, entry] of entries) {
    await writeFile(path.join(directory, 'catalog/plugins', file), `${JSON.stringify(entry)}\n`)
  }
  return directory
}

function run(directory, ...arguments_) {
  return spawnSync(process.execPath, [
    script,
    '--catalog-root', directory,
    ...arguments_,
  ], { encoding: 'utf8' })
}

test('creates the exact normalized catalog entry', async t => {
  const directory = await fixture()
  t.after(() => rm(directory, { recursive: true, force: true }))

  const result = run(
    directory,
    '--id', 'Example-Org/My.Plugin',
    '--category', 'skill',
    '--description-en', 'A portable skill example.',
    '--description-zh', '一个可移植的技能示例。',
    '--added', '2026-08-14',
  )
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /已创建 catalog\/plugins\/example-org--my-plugin\.json/)

  const entry = JSON.parse(await readFile(
    path.join(directory, 'catalog/plugins/example-org--my-plugin.json'),
    'utf8',
  ))
  assert.deepEqual(entry, {
    $schema: '../schema/plugin.schema.json',
    id: 'Example-Org/My.Plugin',
    name: 'My.Plugin',
    repository: 'https://github.com/Example-Org/My.Plugin',
    category: 'skill',
    description: {
      en: 'A portable skill example.',
      zh: '一个可移植的技能示例。',
    },
    added: '2026-08-14',
  })
})

test('creates a subdirectory catalog entry with repo-root repository and slugged filename', async t => {
  const directory = await fixture()
  t.after(() => rm(directory, { recursive: true, force: true }))

  const result = run(
    directory,
    '--id', 'Example-Org/My.Plugin/Packages/Sub_Dir',
    '--category', 'skill',
    '--description-en', 'A monorepo subpackage plugin.',
    '--description-zh', '一个 monorepo 子包插件。',
    '--added', '2026-08-16',
  )
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /已创建 catalog\/plugins\/example-org--my-plugin--packages--sub-dir\.json/)

  const entry = JSON.parse(await readFile(
    path.join(directory, 'catalog/plugins/example-org--my-plugin--packages--sub-dir.json'),
    'utf8',
  ))
  assert.deepEqual(entry, {
    $schema: '../schema/plugin.schema.json',
    // The id is preserved verbatim, path segments included.
    id: 'Example-Org/My.Plugin/Packages/Sub_Dir',
    // The default name is the last id segment (the subpackage directory).
    name: 'Sub_Dir',
    // The repository URL comes from the first two id segments only.
    repository: 'https://github.com/Example-Org/My.Plugin',
    category: 'skill',
    description: {
      en: 'A monorepo subpackage plugin.',
      zh: '一个 monorepo 子包插件。',
    },
    added: '2026-08-16',
  })
})

test('rejects dot and dot-dot id path segments', async t => {
  const directory = await fixture()
  t.after(() => rm(directory, { recursive: true, force: true }))

  for (const id of ['owner/repository/..', 'owner/repository/../escape', 'owner/repository/.', 'owner/repository//nested']) {
    const result = run(
      directory,
      '--id', id,
      '--category', 'tools',
      '--description-en', 'A traversal attempt.',
      '--description-zh', '路径穿越尝试。',
    )
    assert.notEqual(result.status, 0, `expected rejection for ${id}`)
    assert.match(result.stderr, /--id 必须使用 owner\/repository\[\/sub\/dir\] 格式/)
  }
})

test('rejects duplicate plugin ids case-insensitively', async t => {
  const existing = {
    id: 'owner/plugin/packages/foo',
    repository: 'https://github.com/owner/plugin',
  }
  const directory = await fixture([['owner--plugin--packages--foo.json', existing]])
  t.after(() => rm(directory, { recursive: true, force: true }))

  const result = run(
    directory,
    '--id', 'OWNER/PLUGIN/PACKAGES/FOO',
    '--category', 'tools',
    '--description-en', 'A duplicate.',
    '--description-zh', '重复条目。',
  )
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /插件 ID 已存在/)
})

test('allows another subdirectory entry for an already-cataloged repository', async t => {
  const existing = {
    id: 'owner/plugin',
    repository: 'https://github.com/owner/plugin',
  }
  const directory = await fixture([['owner--plugin.json', existing]])
  t.after(() => rm(directory, { recursive: true, force: true }))

  const result = run(
    directory,
    '--id', 'owner/plugin/packages/foo',
    '--category', 'tools',
    '--description-en', 'A subpackage of an existing repository.',
    '--description-zh', '同一仓库的子包条目。',
    '--added', '2026-08-16',
  )
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /已创建 catalog\/plugins\/owner--plugin--packages--foo\.json/)

  const entry = JSON.parse(await readFile(
    path.join(directory, 'catalog/plugins/owner--plugin--packages--foo.json'),
    'utf8',
  ))
  assert.equal(entry.id, 'owner/plugin/packages/foo')
  assert.equal(entry.repository, 'https://github.com/owner/plugin')
})

test('rejects unknown categories', async t => {
  const directory = await fixture()
  t.after(() => rm(directory, { recursive: true, force: true }))

  const result = run(
    directory,
    '--id', 'owner/plugin',
    '--category', 'unknown',
    '--description-en', 'An invalid category.',
    '--description-zh', '无效分类。',
  )
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /未知分类“unknown”/)
})

test('dry-run prints JSON without creating a file', async t => {
  const directory = await fixture()
  t.after(() => rm(directory, { recursive: true, force: true }))

  const result = run(
    directory,
    '--id', 'owner/plugin',
    '--category', 'tools',
    '--description-en', 'A dry-run plugin.',
    '--description-zh', '试运行插件。',
    '--added', '2026-08-14',
    '--dry-run',
  )
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).id, 'owner/plugin')
  await assert.rejects(readFile(path.join(directory, 'catalog/plugins/owner--plugin.json')))
})

test('documents automatic merge and automatic sync behavior consistently', async () => {
  const contributing = await readFile(path.join(root, 'CONTRIBUTING.md'), 'utf8')
  const readme = await readFile(path.join(root, 'README.md'), 'utf8')
  const pullRequestTemplate = await readFile(path.join(root, '.github/PULL_REQUEST_TEMPLATE.md'), 'utf8')
  const skill = await readFile(path.join(root, 'skills/submit-dsh-plugin/SKILL.md'), 'utf8')
  const reference = await readFile(path.join(root, 'skills/submit-dsh-plugin/references/submission-reference.md'), 'utf8')

  assert.match(contributing, /merged automatically/i)
  assert.match(contributing, /synced automatically/i)
  assert.match(contributing, /failed review leaves the pull request open/i)
  assert.match(contributing, /never closes a pull request/i)
  assert.match(contributing, /maintainer review is required/i)
  assert.doesNotMatch(contributing, /CI \/ verify|maintainer(s)? refresh/i)
  assert.match(readme, /自动合并/)
  assert.match(readme, /自动同步/)
  assert.doesNotMatch(readme, /结构化目录数据|catalog\/generated/)
  assert.match(pullRequestTemplate, /merged automatically/i)
  assert.match(pullRequestTemplate, /refresh(es)? automatically/i)
  assert.match(pullRequestTemplate, /failed review leaves this PR open/i)
  assert.match(pullRequestTemplate, /maintainer reviews and merges/i)
  assert.match(skill, /自动合并/)
  assert.match(skill, /自动同步/)
  assert.match(skill, /检查失败，PR 会保持打开且不会被工作流自动关闭/)
  assert.match(skill, /维护者人工审核/)
  assert.doesNotMatch(skill, /CI \/ verify|由维护者单独更新/)
  assert.match(reference, /自动合并/)
  assert.match(reference, /自动同步/)
  assert.match(reference, /自动审查失败时，PR 会保持打开/)
  assert.match(reference, /维护者人工审核/)
})

test('keeps the maintainer API checklist out of catalog submission instructions', async () => {
  const pullRequestTemplate = await readFile(path.join(root, '.github/PULL_REQUEST_TEMPLATE.md'), 'utf8')
  const skill = await readFile(path.join(root, 'skills/submit-dsh-plugin/SKILL.md'), 'utf8')
  const reference = await readFile(path.join(root, 'skills/submit-dsh-plugin/references/submission-reference.md'), 'utf8')

  assert.match(pullRequestTemplate, /Maintainer API compatibility/)
  assert.match(pullRequestTemplate, /Catalog-only plugin submissions leave this section unchecked/)
  assert.match(skill, /Maintainer API compatibility/)
  assert.match(skill, /目录投稿不得勾选或填写该段/)
  assert.match(reference, /Maintainer API compatibility/)
  assert.match(reference, /插件目录投稿保持该段全部未勾选/)
})

test('documents the subdirectory plugin id contract consistently', async () => {
  const contributing = await readFile(path.join(root, 'CONTRIBUTING.md'), 'utf8')
  const skill = await readFile(path.join(root, 'skills/submit-dsh-plugin/SKILL.md'), 'utf8')
  const reference = await readFile(path.join(root, 'skills/submit-dsh-plugin/references/submission-reference.md'), 'utf8')

  // CONTRIBUTING.md carries the canonical contract; the skill docs must agree.
  assert.match(contributing, /owner\/repository\/sub\/dir/)
  assert.match(contributing, /github:owner\/repository#path:sub\/dir/)
  assert.match(contributing, /owner--repository--packages--foo\.json/)
  assert.match(contributing, /may not be `\.` or `\.\.`/)
  assert.match(contributing, /one JSON file per plugin/)
  assert.doesNotMatch(contributing, /one JSON file per repository/i)

  // SKILL.md: extended id form, repo-root repository, install spec, filename
  // slug, id-level uniqueness, and the path-aware branch/commit examples.
  assert.match(skill, /owner\/repository\/sub\/dir/)
  assert.match(skill, /github:owner\/repository#path:sub\/dir/)
  assert.match(skill, /`https:\/\/github\.com\/owner\/repository`/)
  assert.match(skill, /owner--repository--packages--foo\.json/)
  assert.match(skill, /路径段不得是 `\.` 或 `\.\.`/)
  assert.match(skill, /重复 ID（不区分大小写/)
  assert.match(skill, /add-owner-repository-sub-dir/)
  assert.match(skill, /catalog: add owner\/repository\/packages\/foo/)
  assert.match(skill, /`gh repo edit` 的参数只取 ID 的前两段/)
  assert.doesNotMatch(skill, /重复仓库|插件仓库 ID|插件 ID 或仓库已经存在/)

  // submission-reference.md: metadata rules and the PR body template.
  assert.match(reference, /owner\/repository\/sub\/dir/)
  assert.match(reference, /`https:\/\/github\.com\/<owner>\/<repository>`/)
  assert.match(reference, /github:owner\/repository#path:sub\/dir/)
  assert.match(reference, /owner--repository--packages--foo\.json/)
  assert.match(reference, /路径段不得是 `\.` 或 `\.\.`/)
  assert.match(reference, /不区分大小写/)
  assert.match(reference, /子目录：`<sub\/dir>`/)
  assert.doesNotMatch(reference, /将 `repository` 固定为 `https:\/\/github\.com\/<id>`/)
  assert.doesNotMatch(reference, /根据全小写 owner 和 repository 生成文件名/)
})

test('runs only the trusted static gate for pull requests', async () => {
  const ciWorkflow = await readFile(path.join(root, '.github/workflows/ci.yml'), 'utf8')
  const reviewWorkflow = await readFile(path.join(root, '.github/workflows/plugin-review.yml'), 'utf8')
  const staticReviewJob = reviewWorkflow.match(/\n  static-review:[\s\S]*?\n  merge:/)?.[0] ?? ''
  const mergeJob = reviewWorkflow.match(/\n  merge:[\s\S]*/)?.[0] ?? ''

  assert.doesNotMatch(ciWorkflow, /^\s*pull_request:/m)
  assert.match(reviewWorkflow, /^\s*pull_request_target:/m)
  assert.match(reviewWorkflow, /^\s+merge:\n\s+needs: static-review/m)
  assert.match(reviewWorkflow, /PLUGIN_REVIEW_EXPECTED_HEAD_SHA/)
  assert.match(reviewWorkflow, /contents: write/)
  assert.match(staticReviewJob, /^\s+pull-requests: write$/m)
  // Fork PRs are checked out as data only; without this opt-in the checkout
  // step aborts before the reviewer can run or comment.
  assert.match(staticReviewJob, /allow-unsafe-pr-checkout: true/)
  assert.doesNotMatch(mergeJob, /^\s+pull-requests: write$/m)
  // Modification/deletion PRs pass review with verdict=manual-review and must
  // never reach the automatic merge job.
  assert.match(mergeJob, /needs\.static-review\.outputs\.verdict == 'auto-merge'/)
  // Both trusted checkouts must track the base BRANCH. base.sha is frozen at
  // the revision main had when the PR was opened, so pinning to it would stop
  // any fix to the reviewer or merger from reaching already-open PRs.
  assert.doesNotMatch(reviewWorkflow, /pull_request\.base\.sha/)
  assert.equal(reviewWorkflow.match(/ref: \$\{\{ github\.event\.pull_request\.base\.ref \}\}/g)?.length, 2)
})
