import { describe, expect, it, vi } from 'vitest'
import {
  hourBucket,
  loadStarGrowth,
  recordStarSnapshots,
} from '../worker/lib/star-history'
import { TEST_PLUGINS } from './fixtures'

interface PreparedCall {
  sql: string
  params: unknown[]
}

function mockD1(rows: unknown[] = []) {
  const calls: PreparedCall[] = []
  const batch = vi.fn(async () => [])
  const prepare = vi.fn((sql: string) => {
    const call: PreparedCall = { sql, params: [] }
    calls.push(call)
    const statement = {
      bind(...params: unknown[]) {
        call.params = params
        return statement
      },
      async all() {
        return { results: rows }
      },
      async run() {
        return { success: true }
      },
    }
    return statement
  })
  return {
    db: { prepare, batch } as unknown as D1Database,
    batch,
    calls,
  }
}

describe('GitHub star history', () => {
  it('upserts one idempotent snapshot per repository and hour', async () => {
    const capturedAt = Date.parse('2026-08-14T12:15:00Z')
    const { db, batch, calls } = mockD1()

    await recordStarSnapshots(db, TEST_PLUGINS.slice(0, 2), capturedAt)

    expect(batch).toHaveBeenCalledOnce()
    expect(calls).toHaveLength(1)
    expect(calls[0]?.sql).toContain('ON CONFLICT(repository, bucket_hour) DO UPDATE')
    expect(calls[0]?.params.slice(0, 4)).toEqual([
      'openma-ai/deepseek-harness-tui',
      hourBucket(capturedAt),
      capturedAt,
      42,
    ])
  })

  it('uses the closest stored baseline for each growth window', async () => {
    const capturedAt = Date.parse('2026-08-14T12:15:00Z')
    const repository = 'openma-ai/deepseek-harness-tui'
    const { db } = mockD1([
      {
        repository,
        bucket_hour: hourBucket(capturedAt - 24 * 60 * 60 * 1000),
        captured_at: capturedAt - 24 * 60 * 60 * 1000,
        star_count: 39,
      },
      {
        repository,
        bucket_hour: hourBucket(capturedAt - 7 * 24 * 60 * 60 * 1000),
        captured_at: capturedAt - 7 * 24 * 60 * 60 * 1000,
        star_count: 31,
      },
      {
        repository,
        bucket_hour: hourBucket(capturedAt - 30 * 24 * 60 * 60 * 1000),
        captured_at: capturedAt - 30 * 24 * 60 * 60 * 1000,
        star_count: 12,
      },
    ])

    const growth = await loadStarGrowth(db, [TEST_PLUGINS[0]!], capturedAt)

    expect(growth.get(repository)).toEqual({
      growth24h: 3,
      growth7d: 11,
      growth30d: 30,
    })
  })
})
