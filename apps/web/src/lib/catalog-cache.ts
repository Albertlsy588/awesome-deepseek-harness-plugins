import { deriveCatalogResponse, parseCatalogQuery } from '../../worker/lib/catalog'
import type { CatalogResponse as ServerCatalogResponse } from '../../worker/types'
import type { CatalogResponse, CatalogSort } from './api'
import { API_ORIGIN, requestJson } from './api'

// One unfiltered catalog response already contains every plugin plus all
// ranking groups, so filter/sort/search views are derived client-side with the
// exact server logic (deriveCatalogResponse) instead of refetching ~2.5MB per
// filter change. Module scope keeps the cache alive across route remounts,
// e.g. returning from a plugin detail page.
const CATALOG_TTL_MS = 5 * 60 * 1000

let cached: { data: ServerCatalogResponse; fetchedAt: number } | null = null
let inflight: Promise<ServerCatalogResponse> | null = null

export function getCachedCatalog(): ServerCatalogResponse | null {
  return cached?.data ?? null
}

export function isCatalogFresh(): boolean {
  return cached !== null && Date.now() - cached.fetchedAt < CATALOG_TTL_MS
}

export function loadCatalog(options?: { force?: boolean }): Promise<ServerCatalogResponse> {
  if (cached && !options?.force && isCatalogFresh()) return Promise.resolve(cached.data)
  inflight ??= requestJson<ServerCatalogResponse>(`${API_ORIGIN}/api/v1/plugins`)
    .then((data) => {
      cached = { data, fetchedAt: Date.now() }
      return data
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

export interface CatalogViewParams {
  q: string
  category: string
  sort: CatalogSort
}

export function deriveCatalogView(
  full: ServerCatalogResponse,
  params: CatalogViewParams,
): CatalogResponse {
  return deriveCatalogResponse(
    full,
    parseCatalogQuery({ q: params.q, category: params.category, sort: params.sort }),
  )
}
