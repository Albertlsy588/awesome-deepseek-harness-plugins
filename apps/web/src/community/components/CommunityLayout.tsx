import { useEffect, useState } from 'react'
import { LogOut, Sparkles } from 'lucide-react'
import { Link, Outlet } from 'react-router-dom'
import { LanguageSwitch } from '../../components/LanguageSwitch'
import { useI18n } from '../../lib/i18n'
import { api, type CommunityStats } from '../lib/api'
import { startSignIn, useSession } from '../lib/session'
import { Avatar } from './Avatar'
import { communityRules, profilePath } from '../lib/paths'

/**
 * The community section's own frame.
 *
 * Site-level navigation, branding and the footer belong to the site shell; what
 * is left here is what only this section has — who you are signed in as, and the
 * activity rail.
 */

function ViewerChip() {
  const { t } = useI18n()
  const { viewer, loading, signOut } = useSession()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [open])

  if (loading) return <span className="viewer-placeholder" aria-hidden="true" />
  if (!viewer) {
    return (
      <button type="button" className="button-primary button-compact" onClick={startSignIn}>
        {t('signIn')}
      </button>
    )
  }

  return (
    <div className="viewer" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="viewer-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Avatar login={viewer.login} src={viewer.avatarUrl} size={28} />
        <span className="viewer-login">@{viewer.login}</span>
      </button>
      {open ? (
        <div className="viewer-menu" role="menu">
          <Link to={profilePath(viewer.login)} role="menuitem" onClick={() => setOpen(false)}>
            {viewer.login}{t('postsBy')}
          </Link>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); void signOut() }}>
            <LogOut size={14} aria-hidden="true" />
            {t('signOut')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

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

  // 站点其它页面一律不碰滚动位置。这里原来有一个 window.scrollTo({top:0})，
  // 它在 React 画完之后才跑：浏览器先按旧滚动位置画一帧，再跳到顶，切进
  // 社区时就会看见明显的一抖。要改滚动行为得全站一起改，不能只有一页特殊。

  return (
    <div className="community">
      <header className="community-head">
        <div>
          <h1>{t('siteName')}</h1>
          <p>{t('tagline')}</p>
        </div>
        <div className="community-head-actions">
          <LanguageSwitch />
          <ViewerChip />
        </div>
      </header>

      <div className="community-body">
        <div className="community-main">
          <Outlet />
        </div>
        <aside className="community-rail" aria-label={t('stats')}>
          <StatsRail />
        </aside>
      </div>
    </div>
  )
}
