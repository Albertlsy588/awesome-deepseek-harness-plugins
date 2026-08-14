import { Eye, ExternalLink, PackagePlus } from 'lucide-react'
import { Link, Outlet } from 'react-router-dom'
import { formatNumber } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { useLiveStats } from '../lib/useLiveStats'

export function AppShell() {
  const { language, setLanguage, t } = useI18n()
  const { stats, connected } = useLiveStats()

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <Link className="brand" to="/" aria-label="DeepSeek Harness Store homepage">
            <img className="brand-mark" src="/deepseek1024-icon.png" alt="" aria-hidden="true" />
            <span className="brand-copy">
              <strong>
                <span className="brand-base">DeepSeek Harness</span>
                <span>{t('market')}</span>
              </strong>
            </span>
          </Link>

          <div className="header-tools">
            <nav className="main-nav" aria-label="Primary navigation">
              <a
                className="github-link"
                href="https://github.com/imsai-sh/awesome-deepseek-harness-plugins"
                target="_blank"
                rel="noreferrer"
                title="GitHub Repository"
                aria-label="GitHub Repository"
              >
                <img src="/github-mark.svg" alt="" aria-hidden="true" />
              </a>
            </nav>

            <div className="header-live" role="status" aria-live="polite">
              <span className="live-stat online-stat" title={t('onlineNow')}>
                <span className={connected ? 'live-dot is-connected' : 'live-dot'} aria-hidden="true" />
                <strong>{stats ? formatNumber(stats.online, language) : '--'}</strong>
                <small>{t('online')}</small>
              </span>
              <span className="live-divider" aria-hidden="true" />
              <span className="live-stat view-stat" title={t('totalViews')}>
                <Eye size={14} aria-hidden="true" />
                <strong>{stats ? formatNumber(stats.views, language) : '--'}</strong>
                <small>{t('views')}</small>
              </span>
            </div>

            <div className="header-actions">
              <div className="language-switch" aria-label="Language">
                <button
                  type="button"
                  className={language === 'zh' ? 'selected' : undefined}
                  onClick={() => setLanguage('zh')}
                  aria-pressed={language === 'zh'}
                >
                  中
                </button>
                <button
                  type="button"
                  className={language === 'en' ? 'selected' : undefined}
                  onClick={() => setLanguage('en')}
                  aria-pressed={language === 'en'}
                >
                  EN
                </button>
              </div>
              <a
                className="button button-primary header-submit"
                href="/CONTRIBUTING.md"
                title={t('submit')}
              >
                <PackagePlus size={15} aria-hidden="true" />
                <span>{t('submit')}</span>
              </a>
            </div>
          </div>
        </div>
      </header>

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
