import { useEffect, useState } from 'react'
import { BookOpen, ExternalLink, LayoutGrid, MessagesSquare, PackagePlus, Trophy } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import { LanguageSwitch } from './LanguageSwitch'
import { KanbanGirl } from './KanbanGirl'
import { SidebarAccount } from './SidebarAccount'

/**
 * The four sections of the site, in one persistent rail.
 *
 * The community is one of them, not a separate destination: switching to it is
 * a client-side route change, so the reader keeps their session, their language,
 * and their place. `end` matters on the rankings entry — without it, `/` would
 * match every path and every item would look active at once.
 */
const SECTIONS = [
  { to: '/', end: true, icon: Trophy, label: 'rankings' },
  { to: '/plugins', end: false, icon: LayoutGrid, label: 'catalog' },
  { to: '/community', end: false, icon: MessagesSquare, label: 'community' },
  { to: '/docs/api', end: false, icon: BookOpen, label: 'navApi' },
] as const

function SectionLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n()
  return (
    <>
      {SECTIONS.map(({ to, end, icon: Icon, label }) => (
        <NavLink key={to} to={to} end={end} className="nav-link" onClick={onNavigate}>
          <Icon size={17} aria-hidden="true" />
          <span>{t(label)}</span>
        </NavLink>
      ))}
    </>
  )
}

export function AppShell() {
  const { t } = useI18n()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => { setMenuOpen(false) }, [pathname])

  return (
    <div className="app-shell">
      {/* Narrow screens: the rail collapses into a bar with a disclosure. Four
          destinations is too many for a row of chips and too few to deserve a
          bottom tab bar competing with page controls. */}
      <header className="shell-bar">
        <NavLink className="brand" to="/">
          <span className="brand-mark" aria-hidden="true">1024</span>
          <span className="brand-name">{t('market')}</span>
        </NavLink>
        <button
          type="button"
          className="shell-bar-toggle"
          aria-expanded={menuOpen}
          aria-controls="site-sections"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {t(menuOpen ? 'closeMenu' : 'openMenu')}
        </button>
      </header>

      {menuOpen ? (
        <nav id="site-sections" className="shell-bar-menu" aria-label={t('siteActions')}>
          <SectionLinks onNavigate={() => setMenuOpen(false)} />
          <a
            className="nav-link"
            href="https://github.com/imsai-sh/awesome-deepseek-harness-plugins/blob/main/CONTRIBUTING.md"
            target="_blank"
            rel="noreferrer"
          >
            <PackagePlus size={17} aria-hidden="true" />
            <span>{t('submit')}</span>
          </a>
          {/* The sidebar is hidden at this width, so language and account have
              to live here too — otherwise a phone has no way to switch either. */}
          <div className="shell-bar-menu-foot">
            <LanguageSwitch />
            <SidebarAccount />
          </div>
        </nav>
      ) : null}

      <div className="shell-frame">
        <nav className="shell-sidebar" aria-label={t('siteActions')}>
          <NavLink className="brand sidebar-brand" to="/">
            <span className="brand-mark" aria-hidden="true">1024</span>
            <span className="brand-name">{t('market')}</span>
          </NavLink>

          <div className="sidebar-sections">
            <SectionLinks />
          </div>

          {/* An action, not a destination, so it sits below a rule rather than
              among the four sections. It is the only path a visitor has to
              contribute, and it used to be buried in the home page hero. */}
          <div className="sidebar-secondary">
            <a
              className="nav-link"
              href="https://github.com/imsai-sh/awesome-deepseek-harness-plugins/blob/main/CONTRIBUTING.md"
              target="_blank"
              rel="noreferrer"
            >
              <PackagePlus size={17} aria-hidden="true" />
              <span>{t('submit')}</span>
            </a>
          </div>

          {/* Language stays visible rather than folding into the account menu:
              most of this site's traffic is signed-out search traffic, and a
              preference they cannot find is a preference they cannot use. */}
          <div className="sidebar-foot">
            <LanguageSwitch />
            <SidebarAccount />
          </div>
        </nav>

        <main className="shell-content">
          <Outlet />
        </main>
      </div>

      <div className="site-bottom-link shell-bottom-note">
        <p>{t('unofficialNotice')}</p>
        <a href="https://www.deepseek.com/harness/" target="_blank" rel="noreferrer">
          {t('officialHarness')}
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      </div>

      <KanbanGirl />
    </div>
  )
}
