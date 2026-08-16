import {
  AlertCircle,
  ArrowUpRight,
  Code,
  ListFilter,
  PackagePlus,
  Search,
  Trophy,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { LoadingState } from '../components/LoadingState'
import { LanguageSwitch } from '../components/LanguageSwitch'
import { PackageRow } from '../components/PackageRow'
import type { CatalogSort, Language, RankingMode } from '../lib/api'
import {
  deriveCatalogView,
  getCachedCatalog,
  isCatalogFresh,
  loadCatalog,
} from '../lib/catalog-cache'
import { publicAsset } from '../lib/assets'
import { formatDateTime, formatNumber, formatRelativeUpdate } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { useLiveStats } from '../lib/useLiveStats'
import { SITE_ORIGIN, usePageSeo } from '../lib/usePageSeo'

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

function useCountUp(target: number | null, animate: boolean): number | null {
  const [value, setValue] = useState<number | null>(null)
  const previousRef = useRef(0)
  useEffect(() => {
    if (target === null) return
    const from = previousRef.current
    if (
      !animate
      || target === from
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      previousRef.current = target
      setValue(target)
      return
    }
    let frame = 0
    const start = performance.now()
    const step = (now: number) => {
      const progress = Math.min(Math.max((now - start) / 900, 0), 1)
      const eased = 1 - (1 - progress) ** 3
      const next = Math.round(from + (target - from) * eased)
      previousRef.current = next
      setValue(next)
      if (progress < 1) frame = window.requestAnimationFrame(step)
    }
    frame = window.requestAnimationFrame(step)
    // Animation frames stop entirely in hidden/background tabs; make sure the
    // final value still lands once the duration has passed.
    const settle = window.setTimeout(() => {
      previousRef.current = target
      setValue(target)
    }, 1100)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(settle)
    }
  }, [animate, target])
  return value
}

// Isolates the per-frame count-up state so the animation re-renders this leaf
// only, not the whole page while up to 100 package rows are mounted.
function TallyCount({ total, language, animate }: {
  total: number | null
  language: Language
  animate: boolean
}) {
  const value = useCountUp(total, animate)
  return <>{value === null ? '--' : formatNumber(value, language)}</>
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
    <time className="hero-updated" dateTime={value} title={formatDateTime(value, language)}>
      {label}
    </time>
  )
}

// Play the hero entrance (CSS rise + count-up) once per page load, not every
// time the router remounts this page on the way back from a detail view.
let heroIntroPlayed = false

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
  const [playIntro] = useState(() => !heroIntroPlayed)
  useEffect(() => {
    heroIntroPlayed = true
  }, [])
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
  const isGrowthMode =
    rankingMode === 'growth24h' || rankingMode === 'growth7d' || rankingMode === 'growth30d'
  const isPendingRanking = !query && isGrowthMode
  const catalogHref = query ? `/plugins?q=${encodeURIComponent(query)}` : '/plugins'
  const rankingsHref = query ? `/?q=${encodeURIComponent(query)}` : '/'
  const canonicalPath = view === 'catalog' ? '/plugins' : '/'
  const seoTitle = t(view === 'catalog' ? 'catalogSeoTitle' : 'rankingsSeoTitle')
  const seoDescription = t(
    view === 'catalog' ? 'catalogSeoDescription' : 'rankingsSeoDescription',
  )
  const hasIndexableFilters = Boolean(query || category || requestedSort)

  usePageSeo({
    title: seoTitle,
    description: seoDescription,
    path: canonicalPath,
    language,
    robots: hasIndexableFilters ? 'noindex,follow' : 'index,follow',
    schema: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': `${SITE_ORIGIN}${canonicalPath}#webpage`,
      url: `${SITE_ORIGIN}${canonicalPath}`,
      name: seoTitle,
      description: seoDescription,
      isPartOf: {
        '@type': 'WebSite',
        '@id': `${SITE_ORIGIN}/#website`,
        name: 'DSH 1024Store',
        url: `${SITE_ORIGIN}/`,
      },
    },
  })

  return (
    <div
      className={`catalog-page ${view === 'rankings' ? 'rankings-page' : 'directory-page'}${playIntro ? '' : ' hero-static'}`}
    >
      <section className="catalog-hero">
        <div className="page-container catalog-hero-inner">
          <header className="hero-stage">
            <div className="hero-actions" aria-label={t('siteActions')}>
              <Link className="hero-action-link hero-api" to="/docs/api" aria-label={t('apiDocsTitle')}>
                <Code size={16} aria-hidden="true" />
                <span>{t('navApi')}</span>
              </Link>
              <a
                className="hero-action-link github-link"
                href="https://github.com/imsai-sh/awesome-deepseek-harness-plugins"
                target="_blank"
                rel="noreferrer"
              >
                <img src={publicAsset('github-mark.svg')} alt="" aria-hidden="true" />
                <span>GitHub</span>
                <ArrowUpRight size={12} aria-hidden="true" />
              </a>
              <a
                className="hero-action-link hero-submit"
                href="https://github.com/imsai-sh/awesome-deepseek-harness-plugins"
                target="_blank"
                rel="noreferrer"
              >
                <PackagePlus size={16} aria-hidden="true" />
                <span>{t('submit')}</span>
              </a>
              <LanguageSwitch className="hero-language" />
            </div>
            <div className="hero-heading">
              <div className="hero-lockup">
                <span className="hero-lockup-mark" aria-hidden="true">
                  <img src={publicAsset('deepseek1024.png')} alt="" />
                </span>
                <div className="hero-lockup-copy">
                  <p className="hero-eyebrow">{t('heroEyebrow')}</p>
                  <h1>
                    <a
                      href="https://deepseek1024.com/"
                      aria-label="DeepSeek Harness Plugin 1024Store"
                    >
                      <span>DeepSeek Harness Plugin</span>
                      <em>1024Store</em>
                    </a>
                  </h1>
                </div>
              </div>
              <p>{t('rankingsIntro')}</p>
            </div>

            <dl className="hero-tally">
              <div className="hero-tally-count">
                <dt className="hero-tally-label">{t('totalPlugins')}</dt>
                <dd className="hero-tally-value">
                  <TallyCount
                    total={catalog?.meta.catalogTotal ?? null}
                    language={language}
                    animate={playIntro}
                  />
                </dd>
              </div>
              <div className="hero-live">
                <dt className="hero-live-label">
                  <span className={connected ? 'live-dot is-connected' : 'live-dot'} aria-hidden="true" />
                  {t('online')}
                </dt>
                <dd className="hero-live-count">
                  {stats ? formatNumber(stats.online, language) : '--'}
                </dd>
              </div>
              {catalog?.meta.generatedAt && (
                <CatalogUpdatedAt value={catalog.meta.generatedAt} language={language} />
              )}
            </dl>

          </header>
        </div>
      </section>

      <div className="page-container catalog-content">
        <section className="catalog-navigation" aria-label={`${t('search')} / ${t('catalog')} / ${t('rankings')}`}>
          <section className="catalog-toolbar" aria-label={t('search')}>
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
        </section>

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
              <div className="ranking-mode-groups">
                <div className="ranking-mode-group">
                  <span>{t('githubRankings')}</span>
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
                      key={`${plugin.owner}/${plugin.repository}`}
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
    </div>
  )
}
