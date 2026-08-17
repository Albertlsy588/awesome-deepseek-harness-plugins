import { AlertCircle, PackagePlus, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { LoadingState } from '../components/LoadingState'
import { PackageRow } from '../components/PackageRow'
import { SelfInstallBanner } from '../components/SelfInstallBanner'
import { SiteHero } from '../components/SiteHero'
import type { CatalogSort, Language, RankingMode } from '../lib/api'
import {
  deriveCatalogView,
  getCachedCatalog,
  isCatalogFresh,
  loadCatalog,
} from '../lib/catalog-cache'
import { formatDateTime, formatNumber, formatRelativeUpdate } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { pluginDetailPath } from '../../worker/lib/plugin-id'
import { useLiveStats } from '../lib/useLiveStats'
import {
  collectionCopy,
  collectionPageNode,
  graph,
  itemListNode,
  siteNodes,
  SITE_ORIGIN,
} from '../../worker/seo-templates'
import { usePageSeo } from '../lib/usePageSeo'

const SORT_MODES: CatalogSort[] = ['stars', 'newest', 'active']
// Directory rows render in bounded batches so a filter click does not mount
// the full multi-thousand-plugin list in one commit.
const PAGE_SIZE = 100
// growth7d / growth30d stay available in the API but are hidden here until
// enough snapshot history accumulates to make those windows meaningful.
const GITHUB_RANKING_MODES: RankingMode[] = [
  'growth24h',
  'stars',
  'newest',
  'active',
]

function rankingLabel(mode: RankingMode): Parameters<ReturnType<typeof useI18n>['t']>[0] {
  if (mode === 'installs') return 'topInstalls'
  if (mode === 'installs24h') return 'installs24h'
  if (mode === 'installs7d') return 'installs7d'
  if (mode === 'installs30d') return 'installs30d'
  if (mode === 'growth24h') return 'growth24h'
  if (mode === 'growth7d') return 'growth7d'
  if (mode === 'growth30d') return 'growth30d'
  if (mode === 'stars') return 'topStars'
  if (mode === 'newest') return 'latestReleases'
  return 'recentlyActive'
}

function CatalogUpdatedAt({ value, language }: { value: string; language: Language }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  const label = formatRelativeUpdate(value, language, now)
  if (!label) return null

  return (
    <time className="page-head-updated" dateTime={value} title={formatDateTime(value, language)}>
      {label}
    </time>
  )
}

// Play the hero entrance (CSS rise + count-up) once per page load, not every
interface CatalogPageProps {
  view: 'catalog' | 'rankings'
}

export function CatalogPage({ view }: CatalogPageProps) {
  const { language, t } = useI18n()
  const { stats, connected } = useLiveStats()
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const category = searchParams.get('category') ?? ''
  const requestedSort = searchParams.get('sort')
  const sort: CatalogSort = view === 'catalog' && SORT_MODES.includes(requestedSort as CatalogSort)
    ? requestedSort as CatalogSort
    : 'stars'
  const [draftQuery, setDraftQuery] = useState(query)
  const [rankingMode, setRankingMode] = useState<RankingMode>('growth24h')
  // The full unfiltered catalog; every filter/sort/search view derives from it
  // synchronously, so selection feedback never waits on the network.
  const [fullCatalog, setFullCatalog] = useState(() => getCachedCatalog())
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
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
    let cancelled = false
    const force = reload > 0
    if (force || !isCatalogFresh()) setRefreshing(true)
    // The shared fetch is not aborted on unmount: letting it finish primes the
    // module cache for the next mount (e.g. back from a detail page).
    loadCatalog({ force })
      .then((data) => {
        if (cancelled) return
        setFullCatalog(data)
        setError(null)
      })
      .catch((requestError: unknown) => {
        // A failed background refresh keeps showing the last good catalog.
        if (cancelled || getCachedCatalog()) return
        setError(requestError instanceof Error ? requestError.message : t('loadError'))
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false)
      })
    return () => {
      cancelled = true
    }
  }, [reload, t])

  const catalog = useMemo(
    () =>
      fullCatalog
        ? deriveCatalogView(
            fullCatalog,
            view === 'catalog'
              ? { q: query, category, sort }
              : { q: query, category: '', sort: rankingMode },
          )
        : null,
    [category, fullCatalog, query, rankingMode, sort, view],
  )

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

  // Incremental directory rendering; the visible count resets whenever the
  // filter combination changes (key mismatch falls back to the first page).
  const directoryKey = `${query}|${category}|${sort}`
  const [directoryPage, setDirectoryPage] = useState({ key: directoryKey, count: PAGE_SIZE })
  const visibleCount = directoryPage.key === directoryKey ? directoryPage.count : PAGE_SIZE
  const visiblePackages = useMemo(
    () => catalog?.packages.slice(0, visibleCount) ?? [],
    [catalog, visibleCount],
  )
  const hasMorePackages = (catalog?.packages.length ?? 0) > visibleCount

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
  // 右栏用：按发布时间取最近几条，两个板块共用。
  const latestAdditions = useMemo(
    () => (catalog?.rankings.newest ?? []).slice(0, 5),
    [catalog],
  )
  const isGrowthMode =
    rankingMode === 'growth24h' || rankingMode === 'growth7d' || rankingMode === 'growth30d'
  const isPendingRanking = !query && isGrowthMode
  const canonicalPath = view === 'catalog' ? '/plugins' : '/'
  // Titles, descriptions and JSON-LD come from the same module the Worker uses,
  // so a client-side navigation cannot disagree with the served HTML.
  const copy = collectionCopy(
    view === 'catalog' ? 'catalog' : 'rankings',
    language,
    catalog?.meta.catalogTotal ?? 0,
  )
  const hasIndexableFilters = Boolean(query || category || requestedSort)
  const rankedForSchema = useMemo(
    () => (view === 'catalog'
      ? catalog?.rankings.stars ?? []
      : catalog?.rankings[rankingMode] ?? []).slice(0, 30),
    [catalog, rankingMode, view],
  )

  usePageSeo({
    title: copy.title,
    description: copy.description,
    path: canonicalPath,
    language,
    // Until the catalog resolves there is no ItemList and no plugin count, and
    // writing that emptiness over the Worker's populated metadata is strictly
    // worse than leaving the served head alone.
    ready: Boolean(catalog),
    robots: hasIndexableFilters ? 'noindex,follow' : 'index,follow',
    canonical: hasIndexableFilters ? null : `${SITE_ORIGIN}${canonicalPath}`,
    schema: graph([
      ...siteNodes(),
      collectionPageNode(
        canonicalPath,
        copy,
        language,
        `${SITE_ORIGIN}${canonicalPath === '/' ? '/' : canonicalPath}#items`,
      ),
      itemListNode(
        rankedForSchema,
        canonicalPath,
        copy.listHeading,
        catalog?.meta.catalogTotal ?? rankedForSchema.length,
      ),
    ]),
  })

  return (
    <div className={`page catalog-page ${view === 'rankings' ? 'rankings-page' : 'directory-page'}`}>
      {/* 只在排行榜页。安装命令紧跟其后，整行宽——它是全站主 CTA。 */}
      {view === 'rankings' && (
        <>
          <SiteHero
            total={catalog?.meta.catalogTotal ?? null}
            liveCount={stats?.online ?? null}
            connected={connected}
            language={language}
          />
          <SelfInstallBanner />
        </>
      )}

      <header className="page-head">
        <div className="page-head-titles">
          <h1>{copy.heading}</h1>
          <p className="page-head-sub">
            {copy.intro}
            {catalog?.meta.generatedAt && (
              <CatalogUpdatedAt value={catalog.meta.generatedAt} language={language} />
            )}
          </p>
        </div>
        <div className="page-head-actions">
          <a
            className="button button-primary"
            href="https://github.com/imsai-sh/awesome-deepseek-harness-plugins/blob/main/CONTRIBUTING.md"
            target="_blank"
            rel="noreferrer"
          >
            <PackagePlus size={16} aria-hidden="true" />
            {t('submit')}
          </a>
        </div>
      </header>

      <div className="catalog-content page-body has-rail">
        <div className="page-main">
        <div className="page-toolbar">
          <label className="search-control">
              <Search size={19} aria-hidden="true" />
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
        </div>

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
          <section className="catalog-section ranking-section" aria-labelledby="rankings-heading">
            <h2 id="rankings-heading" className="visually-hidden">{copy.listHeading}</h2>
            <div className="view-controls">
              <div className="ranking-mode-groups">
                <div className="ranking-mode-group">
                  <div className="segmented-control" role="group" aria-label={t('githubRankings')}>
                    {GITHUB_RANKING_MODES.map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={rankingMode === mode ? 'selected' : undefined}
                        onClick={() => setRankingMode(mode)}
                        aria-pressed={rankingMode === mode}
                      >
                        {t(rankingLabel(mode))}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {refreshing && catalog && (
                <span className="refresh-note" role="status">{t('refreshing')}</span>
              )}
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
                <h3>{t(
                  isGrowthMode && !query
                    ? 'growthPendingTitle'
                    : 'emptyTitle',
                )}</h3>
                <p>{t(
                  isGrowthMode && !query
                    ? 'growthPendingBody'
                    : 'emptyBody',
                )}</p>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={isPendingRanking ? () => setRankingMode('stars') : resetFilters}
                >
                  {t(isPendingRanking ? 'topStars' : 'reset')}
                </button>
              </div>
            ) : catalog ? (
              <div className={`package-list ranking-list${refreshing ? ' is-refreshing' : ''}`}>
                {ranking.map((plugin, index) => (
                  <PackageRow
                    key={`${rankingMode}-${plugin.id}`}
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
          <section className="catalog-section directory-section" aria-labelledby="directory-heading">
            <h2 id="directory-heading" className="section-title">{copy.listHeading}</h2>
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
              {refreshing && catalog && (
                <span className="refresh-note" role="status">{t('refreshing')}</span>
              )}
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
            ) : !catalog ? (
              <LoadingState />
            ) : catalog.packages.length === 0 ? (
              <div className="state-panel">
                <Search size={27} aria-hidden="true" />
                <h3>{t('emptyTitle')}</h3>
                <p>{t('emptyBody')}</p>
                <button className="button button-secondary" type="button" onClick={resetFilters}>
                  {t('reset')}
                </button>
              </div>
            ) : (
              <>
                <div className={`package-list${refreshing ? ' is-refreshing' : ''}`} aria-live="polite">
                  {visiblePackages.map((plugin, index) => (
                    <PackageRow
                      key={plugin.id}
                      plugin={plugin}
                      category={categoryMap.get(plugin.category)}
                      index={index}
                    />
                  ))}
                </div>
                {hasMorePackages && (
                  <div className="load-more-row">
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() =>
                        setDirectoryPage({ key: directoryKey, count: visibleCount + PAGE_SIZE })}
                    >
                      {t('loadMore')}
                    </button>
                    <span className="load-more-count">
                      {formatNumber(visiblePackages.length, language)}
                      {' / '}
                      {formatNumber(catalog.meta.total, language)}
                    </span>
                  </div>
                )}
              </>
            )}
          </section>
        )}
        </div>

        <aside className="page-rail" aria-label={t('catalogFacts')}>
          <section className="rail-card">
            <h2 className="rail-card-title">{t('catalogFacts')}</h2>
            <dl className="rail-stats">
              <div>
                <dt>{t('categories')}</dt>
                <dd>{catalog ? formatNumber(catalog.categories.length, language) : '—'}</dd>
              </div>
              <div>
                <dt>{t('totalPlugins')}</dt>
                <dd>{catalog ? formatNumber(catalog.meta.catalogTotal, language) : '—'}</dd>
              </div>
            </dl>
          </section>

          {/* 「所有插件都验证过能装上」是这个目录区别于随便一个 awesome
              列表的地方，值得一直说着 —— 原来只在 hero 的一行小字里。 */}
          <section className="rail-card">
            <h2 className="rail-card-title">{t('curationTitle')}</h2>
            <p className="rail-card-body">{t('curationBody')}</p>
            <a
              className="rail-card-link"
              href="https://github.com/imsai-sh/awesome-deepseek-harness-plugins/blob/main/CONTRIBUTING.md"
              target="_blank"
              rel="noreferrer"
            >
              {t('submit')}
            </a>
          </section>

          {latestAdditions.length > 0 && (
            <section className="rail-card">
              <h2 className="rail-card-title">{t('latestReleases')}</h2>
              <ul className="rail-list">
                {latestAdditions.map((plugin) => (
                  <li key={plugin.id}>
                    <Link to={pluginDetailPath(plugin.id)}>{plugin.name}</Link>
                    <span>{categoryMap.get(plugin.category)?.[language] ?? plugin.category}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
