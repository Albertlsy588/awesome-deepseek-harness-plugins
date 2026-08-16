import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loadClassificationQueue,
  neuronsSpentToday,
  recordNeuronSpend,
  saveClassifications,
  type ClassificationCandidate,
} from '../worker/lib/catalog-db'
import {
  isChinese,
  resolveDescriptions,
  responseSchema,
  runPluginClassifyTask,
  systemPrompt,
  validateItem,
  CLASSIFIER_VERSION,
  type ClassifierItem,
} from '../worker/lib/plugin-classify-task'

class SqliteD1Statement {
  constructor(
    private readonly database: DatabaseSync,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]) {
    return new SqliteD1Statement(this.database, this.sql, params)
  }

  async all<T>() {
    return { results: this.database.prepare(this.sql).all(...this.params) as T[] }
  }

  async first<T>() {
    return (this.database.prepare(this.sql).get(...this.params) as T | undefined) ?? null
  }

  async run() {
    const result = this.database.prepare(this.sql).run(...this.params)
    return { success: true, meta: { changes: Number(result.changes) } }
  }
}

function sqliteD1(database: DatabaseSync): D1Database {
  return {
    prepare(sql: string) {
      return new SqliteD1Statement(database, sql)
    },
    async batch(statements: SqliteD1Statement[]) {
      const results = []
      for (const statement of statements) results.push(await statement.run())
      return results
    },
  } as unknown as D1Database
}

function migratedDatabase(): DatabaseSync {
  const database = new DatabaseSync(':memory:')
  for (const file of ['0001_github_star_snapshots.sql', '0002_plugin_catalog.sql',
    '0005_ai_classification.sql']) {
    database.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'))
  }
  return database
}

/** Insert a repository plus its discovery source; `curated` adds a github_pr source. */
function seedRepository(
  database: DatabaseSync,
  id: number,
  fullName: string,
  options: { curated?: boolean; description?: string | null; stars?: number } = {},
): void {
  const now = '2026-08-16T00:00:00Z'
  const [owner, name] = fullName.split('/')
  database.prepare(
    `INSERT INTO catalog_repositories (
       id, github_id, full_name, normalized_full_name, owner, repository_name, html_url,
       description, stars, validation_status, topic_present,
       first_seen_at, last_seen_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'accepted', 1, ?, ?, ?, ?)`,
  ).run(id, id * 100, fullName, fullName.toLowerCase(), owner, name,
    `https://github.com/${fullName}`, options.description ?? null, options.stars ?? 0,
    now, now, now, now)
  database.prepare(
    `INSERT INTO catalog_repository_sources (repository_id, source, first_seen_at, last_seen_at)
     VALUES (?, 'github_topic', ?, ?)`,
  ).run(id, now, now)
  if (options.curated) {
    database.prepare(
      `INSERT INTO catalog_repository_sources (repository_id, source, first_seen_at, last_seen_at)
       VALUES (?, 'github_pr', ?, ?)`,
    ).run(id, now, now)
    database.prepare(
      `INSERT INTO catalog_metadata (
         repository_id, display_name, category, description_en, description_zh,
         added, source, updated_at
       ) VALUES (?, ?, 'tools', ?, ?, '2026-01-01', 'github_pr', ?)`,
    ).run(id, name, `Curated ${name}.`, `人工描述 ${name}。`, now)
  }
}

const candidate = (over: Partial<ClassificationCandidate> = {}): ClassificationCandidate => ({
  repositoryId: 1, fullName: 'owner/dsh-x', repositoryName: 'dsh-x',
  description: null, stars: 0, ...over,
})
const item = (over: Partial<ClassifierItem> = {}): ClassifierItem => ({
  id: 0, category: 'tools', confidence: 0.9,
  description_en: 'Adds a searchable command palette to the composer.',
  description_zh: '为输入框添加可搜索的命令面板。', ...over,
})

describe('0005 migration', () => {
  it('preserves curated rows and keeps column values aligned', () => {
    const database = new DatabaseSync(':memory:')
    database.exec(readFileSync(new URL('../migrations/0002_plugin_catalog.sql', import.meta.url), 'utf8'))
    seedRepository(database, 1, 'owner/curated', { curated: true })
    database.exec(readFileSync(new URL('../migrations/0005_ai_classification.sql', import.meta.url), 'utf8'))

    const row = database.prepare('SELECT * FROM catalog_metadata WHERE repository_id = 1').get() as
      Record<string, unknown>
    expect(row.category).toBe('tools')
    expect(row.source).toBe('github_pr')
    expect(row.description_zh).toBe('人工描述 curated。')
    // updated_at must not have slipped into one of the two new columns
    expect(row.updated_at).toBe('2026-08-16T00:00:00Z')
    expect(row.classifier_version).toBeNull()
    expect(row.description_origin).toBeNull()
  })

  it('now accepts ai rows that the old CHECK rejected', () => {
    const database = migratedDatabase()
    seedRepository(database, 1, 'owner/discovered')
    expect(() => database.prepare(
      `INSERT INTO catalog_metadata (repository_id, display_name, category, description_en,
         description_zh, added, source, classifier_version, description_origin, updated_at)
       VALUES (1, 'x', 'ui', 'en', 'zh', '2026-08-16', 'ai', 'v1', 'generated', 'now')`,
    ).run()).not.toThrow()
  })
})

describe('loadClassificationQueue', () => {
  let database: DatabaseSync
  beforeEach(() => { database = migratedDatabase() })

  it('excludes curated repositories even when their metadata says source=ai', async () => {
    seedRepository(database, 1, 'owner/curated', { curated: true })
    seedRepository(database, 2, 'owner/discovered')
    // Simulate the syncCuratedEntries quirk: its upsert never rewrites `source`,
    // so a repo classified before its PR landed still reads as 'ai'.
    database.prepare("UPDATE catalog_metadata SET source = 'ai' WHERE repository_id = 1").run()

    const queue = await loadClassificationQueue(sqliteD1(database), CLASSIFIER_VERSION, 10)
    expect(queue.map((entry) => entry.repositoryId)).toEqual([2])
  })

  it('skips rows already classified at the current version, re-enqueues on bump', async () => {
    seedRepository(database, 1, 'owner/discovered')
    const db = sqliteD1(database)
    await saveClassifications(db, [{
      repositoryId: 1, displayName: 'discovered', category: 'ui',
      descriptionEn: 'en.', descriptionZh: '中文。', descriptionOrigin: 'generated',
      added: '2026-08-16',
    }], CLASSIFIER_VERSION)

    expect(await loadClassificationQueue(db, CLASSIFIER_VERSION, 10)).toHaveLength(0)
    expect(await loadClassificationQueue(db, 'v2-next', 10)).toHaveLength(1)
  })

  it('orders by stars so the most visible plugins are fixed first', async () => {
    seedRepository(database, 1, 'owner/low', { stars: 3 })
    seedRepository(database, 2, 'owner/high', { stars: 900 })
    const queue = await loadClassificationQueue(sqliteD1(database), CLASSIFIER_VERSION, 10)
    expect(queue.map((entry) => entry.repositoryName)).toEqual(['high', 'low'])
  })

  it('ignores repositories that are not accepted', async () => {
    seedRepository(database, 1, 'owner/discovered')
    database.prepare("UPDATE catalog_repositories SET validation_status = 'rejected'").run()
    expect(await loadClassificationQueue(sqliteD1(database), CLASSIFIER_VERSION, 10)).toHaveLength(0)
  })
})

describe('saveClassifications', () => {
  it('refuses to overwrite a curated row', async () => {
    const database = migratedDatabase()
    seedRepository(database, 1, 'owner/curated', { curated: true })
    await saveClassifications(sqliteD1(database), [{
      repositoryId: 1, displayName: 'hijacked', category: 'fun',
      descriptionEn: 'AI overwrote this.', descriptionZh: 'AI 覆盖了这个。',
      descriptionOrigin: 'generated', added: '2026-08-16',
    }], CLASSIFIER_VERSION)

    const row = database.prepare('SELECT * FROM catalog_metadata WHERE repository_id = 1').get() as
      Record<string, unknown>
    expect(row.category).toBe('tools')
    expect(row.source).toBe('github_pr')
    expect(row.description_en).toBe('Curated curated.')
  })

  it('updates its own rows across versions', async () => {
    const database = migratedDatabase()
    seedRepository(database, 1, 'owner/discovered')
    const db = sqliteD1(database)
    const entry = {
      repositoryId: 1, displayName: 'discovered', category: 'ui',
      descriptionEn: 'first.', descriptionZh: '第一版。',
      descriptionOrigin: 'generated' as const, added: '2026-08-16',
    }
    await saveClassifications(db, [entry], 'v1')
    await saveClassifications(db, [{ ...entry, category: 'theme', descriptionEn: 'second.' }], 'v2')

    const row = database.prepare('SELECT * FROM catalog_metadata WHERE repository_id = 1').get() as
      Record<string, unknown>
    expect(row.category).toBe('theme')
    expect(row.classifier_version).toBe('v2')
  })
})

describe('resolveDescriptions', () => {
  it('keeps an English author blurb verbatim and takes only the translation', () => {
    const result = resolveDescriptions(
      candidate({ description: 'Original author text.' }),
      item({ description_en: 'Model rewrote it.', description_zh: '模型翻译。' }),
    )
    expect(result.descriptionEn).toBe('Original author text.')
    expect(result.descriptionZh).toBe('模型翻译。')
    expect(result.descriptionOrigin).toBe('author_en')
  })

  it('keeps a Chinese author blurb verbatim', () => {
    const result = resolveDescriptions(
      candidate({ description: '这是作者写的中文描述。' }),
      item({ description_en: 'Model translation.', description_zh: '模型改写的中文。' }),
    )
    expect(result.descriptionZh).toBe('这是作者写的中文描述。')
    expect(result.descriptionEn).toBe('Model translation.')
    expect(result.descriptionOrigin).toBe('author_zh')
  })

  it('treats the synthesised placeholder as no description at all', () => {
    const result = resolveDescriptions(
      candidate({ description: 'owner/dsh-x discovered from GitHub.' }),
      item(),
    )
    expect(result.descriptionOrigin).toBe('generated')
    expect(result.descriptionEn).toBe(item().description_en)
  })
})

describe('validateItem', () => {
  it('accepts a well-formed item', () => {
    expect(validateItem(item(), { id: 0 })).toEqual([])
  })

  it('flags a description cut off mid-sentence', () => {
    expect(validateItem(item({ description_en: 'Renders reports in mut' }), { id: 0 }))
      .toContain('en_truncated')
  })

  it('flags a mismatched id', () => {
    expect(validateItem(item({ id: 7 }), { id: 0 })).toContain('id_mismatch')
  })

  it('flags a category outside the catalog', () => {
    expect(validateItem(item({ category: 'networking' }), { id: 0 })).toContain('unknown_category')
  })

  it('flags an over-long description', () => {
    expect(validateItem(item({ description_en: `${'a'.repeat(220)}.` }), { id: 0 }))
      .toContain('en_too_long')
  })
})

describe('isChinese', () => {
  it.each([
    ['这是中文描述。', true],
    ['Adds a command palette.', false],
    ['支持 MCP 工具接入。', true],
    ['', false],
  ])('%s → %s', (text, expected) => {
    expect(isChinese(text)).toBe(expected)
  })
})

describe('responseSchema', () => {
  it('is flat, because Workers AI 500s on the nested {name, schema} form', () => {
    const schema = responseSchema()
    expect(schema.type).toBe('object')
    expect(schema).not.toHaveProperty('name')
  })

  it('constrains category to the catalog ids plus unclassified', () => {
    const enumValues = responseSchema().properties.items.items.properties.category.enum
    expect(enumValues).toContain('tools')
    expect(enumValues).toContain('unclassified')
    expect(enumValues).not.toContain('networking')
  })

  it('sets maxLength far above the target so it never truncates mid-sentence', () => {
    const properties = responseSchema().properties.items.items.properties
    expect(properties.description_en.maxLength).toBeGreaterThan(200)
    expect(properties.description_zh.maxLength).toBeGreaterThan(100)
  })
})

describe('systemPrompt', () => {
  it('contains the word json, which DeepSeek requires for JSON output', () => {
    expect(systemPrompt().toLowerCase()).toContain('json')
  })

  it('lists every catalog category', () => {
    const prompt = systemPrompt()
    for (const id of ['ui', 'theme', 'session', 'memory', 'tools', 'skill',
      'workflow', 'notify', 'model', 'dev', 'fun']) {
      expect(prompt).toContain(`- ${id}:`)
    }
  })
})

describe('runPluginClassifyTask', () => {
  function envWith(database: DatabaseSync, run: ReturnType<typeof vi.fn>): Env {
    return {
      CATALOG_DB: sqliteD1(database),
      AI: { run },
      CATALOG_CACHE: { get: vi.fn(), put: vi.fn() },
    } as unknown as Env
  }
  const reply = (items: unknown[], neurons = 12) => ({
    choices: [{ message: { content: JSON.stringify({ items }) } }],
    usage: { neurons },
  })

  it('classifies the queue and stops when it empties', async () => {
    const database = migratedDatabase()
    seedRepository(database, 1, 'owner/dsh-a', { description: 'Adds a palette.' })
    const run = vi.fn()
      .mockResolvedValueOnce(reply([{ ...item(), id: 0 }]))
      .mockResolvedValue(reply([]))

    const result = await runPluginClassifyTask(envWith(database, run), Date.now(), { batchSize: 5 })
    expect(result.written).toBe(1)
    expect(result.neurons).toBe(12)

    const row = database.prepare('SELECT * FROM catalog_metadata WHERE repository_id = 1').get() as
      Record<string, unknown>
    expect(row.source).toBe('ai')
    expect(row.classifier_version).toBe(CLASSIFIER_VERSION)
    // Author's own words are preserved; only the Chinese side comes from the model.
    expect(row.description_en).toBe('Adds a palette.')
    expect(row.description_origin).toBe('author_en')
  })

  it('leaves unclassified verdicts out of the table', async () => {
    const database = migratedDatabase()
    seedRepository(database, 1, 'owner/dsh-a')
    const run = vi.fn().mockResolvedValue(reply([{ ...item(), category: 'unclassified' }]))

    const result = await runPluginClassifyTask(envWith(database, run), Date.now(), { batchSize: 5 })
    expect(result.written).toBe(0)
    expect(result.rejected).toBe(1)
    expect(database.prepare('SELECT COUNT(*) AS n FROM catalog_metadata').get())
      .toEqual({ n: 0 })
  })

  it('drops an item whose id does not line up instead of misattributing it', async () => {
    const database = migratedDatabase()
    seedRepository(database, 1, 'owner/dsh-a')
    const run = vi.fn().mockResolvedValue(reply([{ ...item(), id: 99 }]))

    const result = await runPluginClassifyTask(envWith(database, run), Date.now(), { batchSize: 5 })
    expect(result.written).toBe(0)
    expect(result.rejected).toBe(1)
    expect(database.prepare('SELECT COUNT(*) AS n FROM catalog_metadata').get()).toEqual({ n: 0 })
  })

  it('writes only the aligned items when a batch is partially malformed', async () => {
    const database = migratedDatabase()
    seedRepository(database, 1, 'owner/dsh-a', { stars: 10 })
    seedRepository(database, 2, 'owner/dsh-b', { stars: 5 })
    const run = vi.fn()
      .mockResolvedValueOnce(reply([{ ...item(), id: 0 }, { ...item(), id: 99 }]))
      .mockResolvedValue(reply([]))

    const result = await runPluginClassifyTask(envWith(database, run), Date.now(), { batchSize: 5 })
    // dsh-a (id 0) lands; dsh-b has no matching item and stays unclassified.
    expect(result.written).toBe(1)
    const rows = database.prepare('SELECT repository_id FROM catalog_metadata').all()
    expect(rows).toEqual([{ repository_id: 1 }])
  })

  it('stops before starting when the daily neuron budget is gone', async () => {
    const database = migratedDatabase()
    seedRepository(database, 1, 'owner/dsh-a')
    const db = sqliteD1(database)
    await recordNeuronSpend(db, 9500, new Date().toISOString())
    const run = vi.fn()

    const result = await runPluginClassifyTask(envWith(database, run), Date.now(), {
      dailyBudget: 9000,
    })
    expect(result.budgetExhausted).toBe(true)
    expect(run).not.toHaveBeenCalled()
  })

  it('accumulates neuron spend per UTC day', async () => {
    const database = migratedDatabase()
    const db = sqliteD1(database)
    await recordNeuronSpend(db, 100, '2026-08-16T01:00:00Z')
    await recordNeuronSpend(db, 250, '2026-08-16T23:00:00Z')
    expect(await neuronsSpentToday(db, '2026-08-16T12:00:00Z')).toBe(350)
    expect(await neuronsSpentToday(db, '2026-08-17T00:00:00Z')).toBe(0)
  })

  it('survives an AI failure without writing anything', async () => {
    const database = migratedDatabase()
    seedRepository(database, 1, 'owner/dsh-a')
    const run = vi.fn().mockRejectedValue(new Error('AiError: out of capacity'))

    const result = await runPluginClassifyTask(envWith(database, run), Date.now(), { batchSize: 5 })
    expect(result.batchFailures).toBe(1)
    expect(result.written).toBe(0)
  })

  it('disables thinking and asks for a flat json_schema', async () => {
    const database = migratedDatabase()
    seedRepository(database, 1, 'owner/dsh-a')
    const run = vi.fn().mockResolvedValue(reply([{ ...item(), id: 0 }]))
    await runPluginClassifyTask(envWith(database, run), Date.now(), { batchSize: 5 })

    const [, payload] = run.mock.calls[0] as [string, Record<string, unknown>]
    expect(payload.chat_template_kwargs).toEqual({ enable_thinking: false })
    expect((payload.response_format as { type: string }).type).toBe('json_schema')
  })
})
