import { describe, expect, it, vi } from 'vitest'
import { fetchNpmDownloads7d } from '../worker/lib/npm-downloads'

describe('npm download snapshots', () => {
  it('requests a scoped package individually and validates the window', async () => {
    const fetcher = vi.fn(async () => Response.json({
      package: '@scope/plugin',
      downloads: 1234,
      start: '2026-08-12',
      end: '2026-08-18',
    }))

    await expect(fetchNpmDownloads7d('@scope/plugin', fetcher)).resolves.toEqual({
      status: 'found',
      downloads: 1234,
      start: '2026-08-12',
      end: '2026-08-18',
    })
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.npmjs.org/downloads/point/last-week/%40scope%2Fplugin',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('turns HTTP, transport, and malformed payload failures into retryable errors', async () => {
    await expect(fetchNpmDownloads7d('pkg', async () => new Response(null, { status: 503 })))
      .resolves.toEqual({ status: 'error' })
    await expect(fetchNpmDownloads7d('pkg', async () => { throw new Error('offline') }))
      .resolves.toEqual({ status: 'error' })
    await expect(fetchNpmDownloads7d('pkg', async () => Response.json({
      package: 'other', downloads: -1, start: 'today', end: 'tomorrow',
    }))).resolves.toEqual({ status: 'error' })
  })
})
