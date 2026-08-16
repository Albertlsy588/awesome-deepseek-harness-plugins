import { ArrowUpRight, CalendarDays, Download, Star, TrendingUp, Users } from 'lucide-react'
import { memo } from 'react'
import { Link } from 'react-router-dom'
import type { CatalogPlugin, CategoryResult, RankingMode } from '../lib/api'
import { packagePath, pluginListIdentity } from '../lib/api'
import { formatDate, formatNumber } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { CategoryTag } from './CategoryTag'
import { OwnerAvatar } from './OwnerAvatar'
import { SplitInstallButton } from './SplitInstallButton'

interface PackageRowProps {
  plugin: CatalogPlugin
  category?: CategoryResult
  index: number
  ranking?: RankingMode
}

// Memoized so appending a page of rows leaves already-mounted rows untouched.
export const PackageRow = memo(function PackageRow({
  plugin,
  category,
  index,
  ranking,
}: PackageRowProps) {
  const { language, t } = useI18n()
  const growth = ranking === 'growth24h'
    ? plugin.growth24h
    : ranking === 'growth7d'
      ? plugin.growth7d
      : ranking === 'growth30d'
        ? plugin.growth30d
        : null
  const isGrowthRanking =
    ranking === 'growth24h' || ranking === 'growth7d' || ranking === 'growth30d'
  const isInstallRanking =
    ranking === 'installs' ||
    ranking === 'installs24h' ||
    ranking === 'installs7d' ||
    ranking === 'installs30d'
  const periodInstalls = ranking === 'installs24h'
    ? plugin.installs24h ?? 0
    : ranking === 'installs7d'
      ? plugin.installs7d ?? 0
      : ranking === 'installs30d'
        ? plugin.installs30d ?? 0
        : plugin.installCount ?? 0
  const relevantDate = ranking === 'active'
    ? plugin.pushedAt
    : ranking === 'newest'
      ? plugin.latestReleaseAt ?? plugin.added
      : plugin.pushedAt ?? plugin.added
  const listIdentity = pluginListIdentity(plugin)

  return (
    <article className={`package-row${ranking ? ' ranking-row' : ''}`}>
      <span className={`row-index${index < 3 && ranking ? ' is-leading' : ''}`} aria-label={`${t('rank')} ${index + 1}`}>
        {String(index + 1).padStart(2, '0')}
      </span>

      <OwnerAvatar owner={plugin.owner} size={36} className="owner-avatar" />

      <div className="row-identity">
        <div className="row-title-line">
          {/* The plugin name is the link text: a row-wide overlay anchor gave
              every one of ~2,900 catalog links the same boilerplate label. */}
          <h3 className="row-title">
            <Link className="row-link" to={packagePath(plugin)} target="_blank" rel="noreferrer">
              {listIdentity.displayName}
            </Link>
          </h3>
          <span className="row-owner">{listIdentity.sourceLabel}</span>
        </div>
        <p>{plugin.description[language]}</p>
      </div>

      <CategoryTag category={category} />

      <div className="row-metrics">
        {isInstallRanking ? (
          <span className="install-metric" title={t(
            ranking === 'installs24h'
              ? 'installs24h'
              : ranking === 'installs7d'
                ? 'installs7d'
                : ranking === 'installs30d'
                  ? 'installs30d'
                  : 'installOperations',
          )}>
            {ranking === 'installs' ? (
              <Download size={14} aria-hidden="true" />
            ) : (
              <TrendingUp size={14} aria-hidden="true" />
            )}
            {formatNumber(periodInstalls, language)}
          </span>
        ) : isGrowthRanking ? (
          <span className="growth-metric" title={t('starGrowth')}>
            <TrendingUp size={14} aria-hidden="true" />
            {growth === null
              ? '--'
              : `${growth >= 0 ? '+' : ''}${formatNumber(growth, language)}`}
          </span>
        ) : ranking ? (
          <span title={t('stars')}>
            <Star size={14} aria-hidden="true" />
            {plugin.stars === null ? '--' : formatNumber(plugin.stars, language)}
          </span>
        ) : (
          <span className="install-metric" title={t('installOperations')}>
            <Download size={14} aria-hidden="true" />
            {formatNumber(plugin.installCount ?? 0, language)}
          </span>
        )}
        {isGrowthRanking && (
          <span title={t('stars')}>
            <Star size={14} aria-hidden="true" />
            {plugin.stars === null ? '--' : formatNumber(plugin.stars, language)}
          </span>
        )}
        {isInstallRanking && ranking !== 'installs' && (
          <span title={t('installOperations')}>
            <Download size={14} aria-hidden="true" />
            {formatNumber(plugin.installCount ?? 0, language)}
          </span>
        )}
        {isInstallRanking && (
          <span className="installer-metric" title={t('anonymousInstallers')}>
            <Users size={14} aria-hidden="true" />
            {formatNumber(plugin.installerCount ?? 0, language)}
          </span>
        )}
        {!ranking && (
          <span className="catalog-star-metric" title={t('stars')}>
            <Star size={14} aria-hidden="true" />
            {plugin.stars === null ? '--' : formatNumber(plugin.stars, language)}
          </span>
        )}
        {!isGrowthRanking && !isInstallRanking && (
          <span
            className="date-metric"
            title={ranking === 'newest' ? t('latestRelease') : t('lastPush')}
          >
            <CalendarDays size={14} aria-hidden="true" />
            {relevantDate ? formatDate(relevantDate, language) : '--'}
          </span>
        )}
      </div>

      <SplitInstallButton plugin={plugin} />

      <span
        className="row-open"
        aria-hidden="true"
      >
        <ArrowUpRight size={17} aria-hidden="true" />
      </span>
    </article>
  )
})
