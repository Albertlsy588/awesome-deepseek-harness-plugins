import {
  AlertCircle,
  ListFilter,
  Search,
  Trophy,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { LoadingState } from '../components/LoadingState'
import { PackageRow } from '../components/PackageRow'
import {
  getCatalog,
  type CatalogResponse,
  type CatalogSort,
  type RankingMode,
} from '../lib/api'
import { formatNumber } from '../lib/format'
import { useI18n } from '../lib/i18n'

const SORT_MODES: CatalogSort[] = ['stars', 'newest', 'active']
const RANKING_MODES: RankingMode[] = ['stars', 'newest', 'active']

interface CatalogPageProps {
  view: 'catalog' | 'rankings'
}

export function CatalogPage({ view }: CatalogPageProps) {
  const { language, t } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const category = searchParams.get('category') ?? ''
  const requestedSort = searchParams.get('sort')
  const sort: CatalogSort = view === 'catalog' && SORT_MODES.includes(requestedSort as CatalogSort)
    ? requestedSort as CatalogSort
    : 'stars'
  const [draftQuery, setDraftQuery] = useState(query)
  const [rankingMode, setRankingMode] = useState<RankingMode>('stars')
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)

  useEffect(() => setDraftQuery(query), [query])

  useEffect(() => {
    if (draftQuery === query) return
    const timeout = window.setTimeout(() => {
      const next = new URLSearchParams(searchParams)
      if (draftQuery.trim()) next.set('q', draftQuery.trim())
      else next.delete('q')
      setSearchParams(next, { replace: true })
    }, 220)
    return () => window.clearTimeout(timeout)
  }, [draftQuery, query, searchParams, setSearchParams])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    getCatalog(
      view === 'catalog'
        ? { q: query, category, sort }
        : { q: query, sort: rankingMode },
      controller.signal,
    )
      .then(setCatalog)
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return
        setError(requestError instanceof Error ? requestError.message : t('loadError'))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [category, query, rankingMode, reload, sort, t, view])

  useEffect(() => {
    const interval = window.setInterval(() => setReload((value) => value + 1), 5 * 60 * 1000)
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') setReload((value) => value + 1)
    }
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [])

  const categoryMap = useMemo(
    () => new Map(catalog?.categories.map((item) => [item.id, item]) ?? []),
    [catalog?.categories],
  )

  function updateFilter(key: 'category' | 'sort', value: string) {
    const next = new URLSearchParams(searchParams)
    if (value && !(key === 'sort' && value === 'stars')) next.set(key, value)
    else next.delete(key)
    setSearchParams(next)
  }

  function resetFilters() {
    setDraftQuery('')
    setSearchParams({})
  }

  const ranking = useMemo(() => {
    const candidates = query
      ? catalog?.packages ?? []
      : catalog?.rankings[rankingMode] ?? []
    return candidates.slice(0, 100)
  }, [catalog, query, rankingMode])
  const sourceWarning = catalog?.meta.source === 'stale' ? t('stale') : null
  const catalogHref = query ? `/plugin?q=${encodeURIComponent(query)}` : '/plugin'
  const rankingsHref = query ? `/rankings?q=${encodeURIComponent(query)}` : '/rankings'

  return (
    <div className={`catalog-page ${view === 'rankings' ? 'rankings-page' : 'directory-page'}`}>
      <div className="page-container catalog-content">
        {sourceWarning && (
          <div className="notice notice-warning" role="status">
            <AlertCircle size={17} aria-hidden="true" />
            <span>{sourceWarning}</span>
          </div>
        )}

        <section className="catalog-toolbar" aria-label={t('search')}>
          <label className="search-control">
            <Search size={18} aria-hidden="true" />
            <span className="visually-hidden">{t('search')}</span>
            <input
              type="search"
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder={t('searchPlaceholder')}
            />
            {catalog && (
              <small>
                {catalog.meta.total} {t(catalog.meta.total === 1 ? 'result' : 'results')}
              </small>
            )}
          </label>
        </section>

        <nav className="catalog-view-tabs" aria-label={`${t('catalog')} / ${t('rankings')}`}>
          <Link to={rankingsHref} className={view === 'rankings' ? 'selected' : undefined} aria-current={view === 'rankings' ? 'page' : undefined}>
            <Trophy size={16} aria-hidden="true" />
            {t('rankings')}
          </Link>
          <Link to={catalogHref} className={view === 'catalog' ? 'selected' : undefined} aria-current={view === 'catalog' ? 'page' : undefined}>
            <ListFilter size={16} aria-hidden="true" />
            <span>
              {t('catalog')}{catalog ? ` (${formatNumber(catalog.meta.catalogTotal, language)})` : ''}
            </span>
          </Link>
        </nav>

        {view === 'catalog' && (
          <section className="category-section" aria-labelledby="categories-heading">
            <div className="section-heading compact-heading">
              <h2 id="categories-heading">{t('categories')}</h2>
            </div>
            <div className="category-filter" role="group" aria-label={t('category')}>
              <button
                type="button"
                className={!category ? 'selected' : undefined}
                onClick={() => updateFilter('category', '')}
                aria-pressed={!category}
              >
                {t('allCategories')}
                <span>{catalog?.meta.catalogTotal ?? '--'}</span>
              </button>
              {catalog?.categories.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={category === item.id ? 'selected' : undefined}
                  onClick={() => updateFilter('category', item.id)}
                  aria-pressed={category === item.id}
                >
                  {item[language]}
                  <span>{item.count}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {view === 'rankings' && (
          <section className="catalog-section ranking-section" aria-label={t('rankings')}>
            <div className="view-controls">
              <div className="segmented-control" role="group" aria-label={t('rankings')}>
                {RANKING_MODES.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={rankingMode === mode ? 'selected' : undefined}
                    onClick={() => setRankingMode(mode)}
                    aria-pressed={rankingMode === mode}
                  >
                    {t(mode === 'stars' ? 'topStars' : mode === 'newest' ? 'latestReleases' : 'recentlyActive')}
                  </button>
                ))}
              </div>
            </div>

            {error ? (
              <div className="state-panel" role="alert">
                <AlertCircle size={27} aria-hidden="true" />
                <h3>{t('loadError')}</h3>
                <p>{error}</p>
                <button className="button button-secondary" type="button" onClick={() => setReload((value) => value + 1)}>
                  {t('retry')}
                </button>
              </div>
            ) : catalog && ranking.length === 0 ? (
              <div className="state-panel">
                <Search size={27} aria-hidden="true" />
                <h3>{t('emptyTitle')}</h3>
                <p>{t('emptyBody')}</p>
                <button className="button button-secondary" type="button" onClick={resetFilters}>
                  {t('reset')}
                </button>
              </div>
            ) : catalog ? (
              <div className={`package-list ranking-list${loading ? ' is-refreshing' : ''}`}>
                {ranking.map((plugin, index) => (
                  <PackageRow
                    key={`${rankingMode}-${plugin.owner}/${plugin.repository}`}
                    plugin={plugin}
                    category={categoryMap.get(plugin.category)}
                    index={index}
                    ranking={rankingMode}
                  />
                ))}
              </div>
            ) : !error ? (
              <LoadingState rows={5} />
            ) : null}
          </section>
        )}

        {view === 'catalog' && (
          <section className="catalog-section directory-section" aria-label={t('allPackages')}>
            <div className="view-controls">
              <div className="segmented-control sort-segments" role="group" aria-label={t('sort')}>
                {SORT_MODES.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={sort === mode ? 'selected' : undefined}
                    onClick={() => updateFilter('sort', mode)}
                    aria-pressed={sort === mode}
                  >
                    {t(
                      mode === 'stars'
                        ? 'sortStars'
                        : mode === 'newest'
                          ? 'sortNewest'
                          : 'sortActive',
                    )}
                  </button>
                ))}
              </div>
            </div>

            {error ? (
              <div className="state-panel" role="alert">
                <AlertCircle size={27} aria-hidden="true" />
                <h3>{t('loadError')}</h3>
                <p>{error}</p>
                <button className="button button-secondary" type="button" onClick={() => setReload((value) => value + 1)}>
                  {t('retry')}
                </button>
              </div>
            ) : !catalog && loading ? (
              <LoadingState />
            ) : catalog?.packages.length === 0 ? (
              <div className="state-panel">
                <Search size={27} aria-hidden="true" />
                <h3>{t('emptyTitle')}</h3>
                <p>{t('emptyBody')}</p>
                <button className="button button-secondary" type="button" onClick={resetFilters}>
                  {t('reset')}
                </button>
              </div>
            ) : (
              <div className={`package-list${loading ? ' is-refreshing' : ''}`} aria-live="polite">
                {catalog?.packages.map((plugin, index) => (
                  <PackageRow
                    key={`${plugin.owner}/${plugin.repository}`}
                    plugin={plugin}
                    category={categoryMap.get(plugin.category)}
                    index={index}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
