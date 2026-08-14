import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  Code2,
  ExternalLink,
  GitFork,
  Package,
  ShieldAlert,
  Star,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Link, useParams } from 'react-router-dom'
import remarkGfm from 'remark-gfm'
import { CategoryTag } from '../components/CategoryTag'
import { InstallCommand } from '../components/InstallCommand'
import { OwnerAvatar } from '../components/OwnerAvatar'
import { getPackage, repositoryName, type CategoryResult, type PackageDetail } from '../lib/api'
import { formatDate, formatNumber } from '../lib/format'
import { useI18n } from '../lib/i18n'

const CATEGORY_LABELS: Record<string, CategoryResult> = {
  ui: { id: 'ui', en: 'UI Enhancements', zh: 'UI 增强', count: 0 },
  session: { id: 'session', en: 'Sessions & Messages', zh: '会话与消息', count: 0 },
  tools: { id: 'tools', en: 'Tools & Capabilities', zh: '工具与能力', count: 0 },
  workflow: { id: 'workflow', en: 'Workflow & Automation', zh: '工作流与自动化', count: 0 },
  notify: { id: 'notify', en: 'Notifications & Integrations', zh: '通知与集成', count: 0 },
  dev: { id: 'dev', en: 'Development & Runtime', zh: '开发与运行时', count: 0 },
  fun: { id: 'fun', en: 'Just for Fun', zh: '娱乐', count: 0 },
}

export function PackagePage() {
  const { owner = '', name = '' } = useParams()
  const { language, t } = useI18n()
  const [detail, setDetail] = useState<PackageDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setDetail(null)
    setError(null)
    getPackage(owner, name, controller.signal)
      .then(setDetail)
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return
        setError(requestError instanceof Error ? requestError.message : t('notFoundBody'))
      })
    return () => controller.abort()
  }, [name, owner, reload, t])

  if (error) {
    return (
      <div className="page-container standalone-state">
        <AlertTriangle size={36} aria-hidden="true" />
        <h1>{t('notFound')}</h1>
        <p>{error}</p>
        <div className="state-actions">
          <Link className="button button-primary" to="/plugin">
            <ArrowLeft size={16} aria-hidden="true" />
            {t('back')}
          </Link>
          <button className="button button-secondary" type="button" onClick={() => setReload((value) => value + 1)}>
            {t('retry')}
          </button>
        </div>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="page-container detail-loading" aria-label="Loading">
        <span className="skeleton-line skeleton-line-short" />
        <span className="skeleton-line detail-title-placeholder" />
        <span className="skeleton-line" />
        <div className="detail-panel-placeholder" />
      </div>
    )
  }

  const github = detail.github
  const manifest = detail.manifest
  const runtime = manifest?.engines
    ? Object.entries(manifest.engines)
        .map(([engine, version]) => `${engine} ${version}`)
        .join(', ')
    : null
  const reportUrl = `${detail.url}/issues/new?title=${encodeURIComponent(`[DSH Store] ${detail.name}`)}`
  const branch = github?.defaultBranch ?? 'main'
  const detailOwner = detail.owner
  const detailRepository = repositoryName(detail)

  function readmeLink(href?: string): string | undefined {
    if (!href || /^(https?:|mailto:|#)/.test(href)) return href
    return `https://github.com/${detailOwner}/${detailRepository}/blob/${branch}/${href.replace(/^\.\//, '')}`
  }

  function readmeImage(src?: string): string | undefined {
    if (!src || /^https?:/.test(src)) return src
    return `https://raw.githubusercontent.com/${detailOwner}/${detailRepository}/${branch}/${src.replace(/^\.\//, '')}`
  }

  return (
    <div className="page-container package-detail-page">
      <Link className="back-link" to="/plugin">
        <ArrowLeft size={16} aria-hidden="true" />
        {t('back')}
      </Link>

      <section className="detail-header">
        <OwnerAvatar
          owner={detail.owner}
          size={72}
          className="detail-avatar"
          src={github?.avatarUrl}
          eager
        />
        <div className="detail-heading">
          <div className="detail-title-row">
            <h1>{detail.name}</h1>
            <CategoryTag category={CATEGORY_LABELS[detail.category]} />
          </div>
          <p className="detail-owner">{t('by')} <a href={`https://github.com/${detail.owner}`} target="_blank" rel="noreferrer">{detail.owner}</a></p>
          <p className="detail-description">{detail.description[language]}</p>
        </div>
        <div className="detail-actions">
          <a className="button button-primary" href={detail.url} target="_blank" rel="noreferrer">
            <Code2 size={16} aria-hidden="true" />
            {t('source')}
          </a>
          <a className="button button-secondary" href={reportUrl} target="_blank" rel="noreferrer">
            <CircleDot size={16} aria-hidden="true" />
            {t('report')}
          </a>
        </div>
      </section>

      {github && (
        <dl className="repository-stats">
          <div>
            <dt><Star size={16} aria-hidden="true" /> {t('stars')}</dt>
            <dd>{formatNumber(github.stars, language)}</dd>
          </div>
          <div>
            <dt><GitFork size={16} aria-hidden="true" /> {t('forks')}</dt>
            <dd>{formatNumber(github.forks, language)}</dd>
          </div>
          <div>
            <dt><CircleDot size={16} aria-hidden="true" /> {t('issues')}</dt>
            <dd>{formatNumber(github.openIssues, language)}</dd>
          </div>
          <div>
            <dt><CalendarDays size={16} aria-hidden="true" /> {t('lastPush')}</dt>
            <dd>{formatDate(github.pushedAt, language)}</dd>
          </div>
        </dl>
      )}

      <div className="detail-layout">
        <div className="detail-main">
          <section className="detail-section install-section" aria-labelledby="install-heading">
            <h2 id="install-heading">{t('install')}</h2>
            <InstallCommand command={detail.install} prominent />
          </section>

          <div className={`notice verification-notice ${detail.verification.bundleDeclared ? 'notice-success' : 'notice-warning'}`}>
            {detail.verification.bundleDeclared ? (
              <CheckCircle2 size={20} aria-hidden="true" />
            ) : (
              <AlertTriangle size={20} aria-hidden="true" />
            )}
            <div>
              <strong>{detail.verification.bundleDeclared ? t('verifiedBundle') : t('unverifiedBundle')}</strong>
              <p>{detail.verification.bundleDeclared ? t('verifiedBody') : t('unverifiedBody')}</p>
            </div>
          </div>

          <div className="notice security-notice">
            <ShieldAlert size={20} aria-hidden="true" />
            <div>
              <strong>{t('securityTitle')}</strong>
              <p>{t('securityBody')}</p>
            </div>
          </div>

          <section className="detail-section readme-section" aria-labelledby="readme-heading">
            <h2 id="readme-heading">{t('readme')}</h2>
            {detail.readme ? (
              <div className="markdown-body">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ href, children }) => (
                      <a href={readmeLink(href)} target={href?.startsWith('#') ? undefined : '_blank'} rel="noreferrer">
                        {children}
                      </a>
                    ),
                    img: ({ src, alt }) => <img src={readmeImage(src)} alt={alt ?? ''} loading="lazy" />,
                  }}
                >
                  {detail.readme}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="muted-copy">{t('noReadme')}</p>
            )}
          </section>
        </div>

        <aside className="package-sidebar" aria-labelledby="package-info-heading">
          <h2 id="package-info-heading">
            <Package size={18} aria-hidden="true" />
            {t('packageInfo')}
          </h2>
          <dl className="package-facts">
            <div><dt>{t('version')}</dt><dd>{manifest?.version ?? t('unavailable')}</dd></div>
            <div><dt>{t('license')}</dt><dd>{manifest?.license ?? github?.license ?? t('unavailable')}</dd></div>
            <div><dt>{t('bundlePatch')}</dt><dd><code>{manifest?.bundlePatch ?? t('unavailable')}</code></dd></div>
            <div><dt>{t('dependencies')}</dt><dd>{manifest?.dependencies ?? t('unavailable')}</dd></div>
            <div><dt>{t('peerDependencies')}</dt><dd>{manifest?.peerDependencies ?? t('unavailable')}</dd></div>
            <div><dt>{t('runtime')}</dt><dd>{runtime ?? t('unavailable')}</dd></div>
          </dl>
          {github?.homepage && (
            <a className="sidebar-link" href={github.homepage} target="_blank" rel="noreferrer">
              <ExternalLink size={15} aria-hidden="true" />
              {github.homepage.replace(/^https?:\/\//, '')}
            </a>
          )}
        </aside>
      </div>
    </div>
  )
}
