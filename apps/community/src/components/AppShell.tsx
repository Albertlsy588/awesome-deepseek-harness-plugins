import { useEffect, useState } from 'react'
import { ExternalLink, Flame, Info, LogOut, Sparkles } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { api, type CommunityStats } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { startSignIn, useSession } from '../lib/session'
import { Avatar } from './Avatar'

const STORE_URL = 'https://deepseek1024.com/'

function LanguageSwitch() {
  const { language, setLanguage } = useI18n()
  return (
    <div className="language-switch" role="group" aria-label="Language">
      {(['zh', 'en'] as const).map((option) => (
        <button
          key={option}
          type="button"
          className={language === option ? 'is-active' : ''}
          onClick={() => setLanguage(option)}
          aria-pressed={language === option}
        >
          {option === 'zh' ? '中' : 'EN'}
        </button>
      ))}
    </div>
  )
}

function ViewerButton() {
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
        <Avatar login={viewer.login} src={viewer.avatarUrl} size={30} />
        <span className="viewer-login">@{viewer.login}</span>
      </button>
      {open ? (
        <div className="viewer-menu" role="menu">
          <Link to={`/u/${viewer.login}`} role="menuitem" onClick={() => setOpen(false)}>
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
    </section>
  )
}

export function AppShell() {
  const { t } = useI18n()
  const { pathname } = useLocation()

  useEffect(() => { window.scrollTo({ top: 0 }) }, [pathname])

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-header-inner">
          <Link className="brand" to="/">
            <span className="brand-mark" aria-hidden="true">1024</span>
            <span className="brand-name">{t('siteName')}</span>
          </Link>
          <div className="shell-header-actions">
            <LanguageSwitch />
            <ViewerButton />
          </div>
        </div>
      </header>

      <div className="shell-body">
        <nav className="shell-nav" aria-label={t('siteName')}>
          <NavLink to="/" end className="nav-link">
            <Flame size={16} aria-hidden="true" />
            <span>{t('siteName')}</span>
          </NavLink>
          <NavLink to="/about" className="nav-link">
            <Info size={16} aria-hidden="true" />
            <span>{t('guidelines')}</span>
          </NavLink>
          <a className="nav-link" href={STORE_URL}>
            <ExternalLink size={16} aria-hidden="true" />
            <span>{t('backToStore')}</span>
          </a>
        </nav>

        <main className="shell-main">
          <Outlet />
        </main>

        <aside className="shell-rail" aria-label={t('stats')}>
          <StatsRail />
          <p className="rail-note">{t('unofficialNotice')}</p>
        </aside>
      </div>
    </div>
  )
}
