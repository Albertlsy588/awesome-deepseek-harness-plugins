import { ArrowUpRight, CalendarDays, GitFork, Star, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { CatalogPlugin, CategoryResult, RankingMode } from '../lib/api'
import { packagePath } from '../lib/api'
import { formatDate, formatNumber } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { CategoryTag } from './CategoryTag'
import { InstallCommand } from './InstallCommand'
import { OwnerAvatar } from './OwnerAvatar'

interface PackageRowProps {
  plugin: CatalogPlugin
  category?: CategoryResult
  index: number
  ranking?: RankingMode
}

export function PackageRow({ plugin, category, index, ranking }: PackageRowProps) {
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
  const relevantDate = ranking === 'active'
    ? plugin.pushedAt
    : ranking === 'newest'
      ? plugin.latestReleaseAt ?? plugin.added
      : plugin.pushedAt ?? plugin.added

  return (
    <article className={`package-row${ranking ? ' ranking-row' : ''}`}>
      <span className={`row-index${index < 3 && ranking ? ' is-leading' : ''}`} aria-label={`${t('rank')} ${index + 1}`}>
        {String(index + 1).padStart(2, '0')}
      </span>

      <OwnerAvatar owner={plugin.owner} size={36} className="owner-avatar" />

      <div className="row-identity">
        <div className="row-title-line">
          <Link to={packagePath(plugin)}>{plugin.name}</Link>
          <span>{plugin.owner}</span>
        </div>
        <p>{plugin.description[language]}</p>
      </div>

      <CategoryTag category={category} />

      <div className="row-metrics">
        {isGrowthRanking ? (
          <span className="growth-metric" title={t('starGrowth')}>
            <TrendingUp size={14} aria-hidden="true" />
            {growth === null
              ? '--'
              : `${growth >= 0 ? '+' : ''}${formatNumber(growth, language)}`}
          </span>
        ) : (
          <span title={t('stars')}>
            <Star size={14} aria-hidden="true" />
            {plugin.stars === null ? '--' : formatNumber(plugin.stars, language)}
          </span>
        )}
        {isGrowthRanking && (
          <span title={t('stars')}>
            <Star size={14} aria-hidden="true" />
            {plugin.stars === null ? '--' : formatNumber(plugin.stars, language)}
          </span>
        )}
        {!ranking && (
          <span className="fork-metric" title={t('forks')}>
            <GitFork size={14} aria-hidden="true" />
            {plugin.forks === null ? '--' : formatNumber(plugin.forks, language)}
          </span>
        )}
        {!isGrowthRanking && (
          <span
            className="date-metric"
            title={ranking === 'newest' ? t('latestRelease') : t('lastPush')}
          >
            <CalendarDays size={14} aria-hidden="true" />
            {relevantDate ? formatDate(relevantDate, language) : '--'}
          </span>
        )}
      </div>

      {!ranking && <InstallCommand command={plugin.install} compact />}

      <Link
        className="row-open"
        to={packagePath(plugin)}
        aria-label={`${t('details')}: ${plugin.name}`}
        title={t('details')}
      >
        <ArrowUpRight size={17} aria-hidden="true" />
      </Link>
    </article>
  )
}
