import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useI18n } from '../../lib/i18n'
import { api, type CommunityStats } from '../lib/api'
import { communityRules } from '../lib/paths'

/**
 * The community section's own frame.
 *
 * Navigation, branding, language and identity all belong to the site shell, so
 * what is left here is only what this section has of its own: the page header
 * every section shares, and the activity rail.
 */

function StatsRail() {
  const { t } = useI18n()
  const [stats, setStats] = useState<CommunityStats | null>(null)

  useEffect(() => {
    let cancelled = false
    api.stats().then((next) => { if (!cancelled) setStats(next) }).catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  return (
    <section className="rail-card">
      <h2 className="rail-title">
        <Sparkles size={14} aria-hidden="true" />
        {t('stats')}
      </h2>
      <dl className="stat-grid">
        <div>
          <dt>{t('statPosts')}</dt>
          <dd>{stats ? stats.posts.toLocaleString() : '—'}</dd>
        </div>
        <div>
          <dt>{t('statAuthors')}</dt>
          <dd>{stats ? stats.authors.toLocaleString() : '—'}</dd>
        </div>
        <div>
          <dt>{t('statToday')}</dt>
          <dd>{stats ? stats.postsToday.toLocaleString() : '—'}</dd>
        </div>
      </dl>
      <Link className="rail-link" to={communityRules}>{t('guidelines')}</Link>
    </section>
  )
}

export function CommunityLayout() {
  const { t } = useI18n()
  const { pathname } = useLocation()

  useEffect(() => { window.scrollTo({ top: 0 }) }, [pathname])

  return (
    <div className="page community">
      {/* One line, like every other section. The sidebar already says
          "社区"; a full-width "1024 广场 / 开发者的公开广场" lockup under it
          was the third time the same thing got said. */}
      <header className="page-head">
        <div className="page-head-titles">
          <h1>{t('community')}</h1>
          <p className="page-head-sub">{t('tagline')}</p>
        </div>
        <div className="page-head-actions">
          <Link className="button button-secondary" to={communityRules}>{t('guidelines')}</Link>
        </div>
      </header>

      <div className="page-body has-rail">
        <div className="page-main">
          <Outlet />
        </div>
        <aside className="page-rail" aria-label={t('stats')}>
          <StatsRail />
        </aside>
      </div>
    </div>
  )
}
