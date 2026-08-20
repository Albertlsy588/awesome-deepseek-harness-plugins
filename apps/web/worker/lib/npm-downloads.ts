const DOWNLOADS_ORIGIN = 'https://api.npmjs.org'
const REQUEST_TIMEOUT_MS = 10_000
const DATE = /^\d{4}-\d{2}-\d{2}$/

export type NpmDownloadsResult =
  | {
      status: 'found'
      downloads: number
      start: string
      end: string
    }
  | { status: 'error' }

interface NpmDownloadsPayload {
  downloads?: unknown
  start?: unknown
  end?: unknown
  package?: unknown
}

/** Reads npm's completed rolling seven-day download window for one package. */
export async function fetchNpmDownloads7d(
  packageName: string,
  fetcher: typeof fetch = fetch,
): Promise<NpmDownloadsResult> {
  let response: Response
  try {
    response = await fetcher(
      `${DOWNLOADS_ORIGIN}/downloads/point/last-week/${encodeURIComponent(packageName)}`,
      { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
    )
  } catch {
    return { status: 'error' }
  }
  if (!response.ok) return { status: 'error' }

  let payload: NpmDownloadsPayload
  try {
    payload = await response.json() as NpmDownloadsPayload
  } catch {
    return { status: 'error' }
  }
  if (
    payload.package !== packageName ||
    !Number.isInteger(payload.downloads) ||
    (payload.downloads as number) < 0 ||
    typeof payload.start !== 'string' ||
    !DATE.test(payload.start) ||
    typeof payload.end !== 'string' ||
    !DATE.test(payload.end)
  ) {
    return { status: 'error' }
  }
  return {
    status: 'found',
    downloads: payload.downloads as number,
    start: payload.start,
    end: payload.end,
  }
}
