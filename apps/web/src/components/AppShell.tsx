import { ExternalLink } from 'lucide-react'
import { Outlet, useLocation } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import { SiteToolbar } from './SiteToolbar'

export function AppShell() {
  const { t } = useI18n()
  const { pathname } = useLocation()
  const hasIntegratedToolbar = pathname === '/rankings' || pathname === '/plugin'

  return (
    <div className="app-shell">
      {!hasIntegratedToolbar && (
        <header className="site-header">
          <div className="header-inner">
            <SiteToolbar />
          </div>
        </header>
      )}

      <main>
        <Outlet />
      </main>

      <div className="site-bottom-link">
        <p>{t('unofficialNotice')}</p>
        <a href="https://www.deepseek.com/harness/" target="_blank" rel="noreferrer">
          {t('officialHarness')}
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      </div>
    </div>
  )
}
