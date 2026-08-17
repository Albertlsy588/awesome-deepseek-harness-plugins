import {
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  Download,
  Layers,
  Star,
  TrendingUp,
  Users,
} from 'lucide-react'
import { memo, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import type { CatalogPlugin, CategoryResult, RankingMode } from '../lib/api'
import { packagePath, pluginListIdentity } from '../lib/api'
import { formatDate, formatNumber } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { ROW_LINK_TARGET } from '../lib/link-target'
import { CategoryTag } from './CategoryTag'
import { OwnerAvatar } from './OwnerAvatar'
import { SplitInstallButton } from './SplitInstallButton'

interface PackageRowProps {
  plugin: CatalogPlugin
  category?: CategoryResult
  index: number
  ranking?: RankingMode
  /** Small tag beside the name, e.g. marking the seat inside its own panel. */
  badge?: string
  /** Resolves a category id for the rows rendered inside an expanded panel. */
  categories?: Map<string, CategoryResult>
  /**
   * Every plugin of this row's repository, this one included.
   *
   * Only ranking rows get it, and only boards ranked by a repository-level
   * metric collapse in the first place. Taken from the catalog the page already
   * holds, so an expanded row costs no request.
   */
  repositoryPlugins?: CatalogPlugin[]
}

// Memoized so appending a page of rows leaves already-mounted rows untouched.
export const PackageRow = memo(function PackageRow({
  plugin,
  category,
  index,
  ranking,
  badge,
  categories,
  repositoryPlugins,
}: PackageRowProps) {
  const { language, t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const panelId = useId()
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
  // Only the repository-level boards collapse, so this is zero everywhere else.
  const collapsed = ranking ? (plugin as { repositorySiblings?: number }).repositorySiblings ?? 0 : 0
  const siblings = collapsed > 0 ? repositoryPlugins ?? [] : []
  const expandable = siblings.length > 1
  const relevantDate = ranking === 'active'
    ? plugin.pushedAt
    : ranking === 'newest'
      ? plugin.latestReleaseAt ?? plugin.added
      : plugin.pushedAt ?? plugin.added
  const listIdentity = pluginListIdentity(plugin)

  return (
    <article
      className={`package-row${ranking ? ' ranking-row' : ''}${expandable ? ' is-expandable' : ''}${
        expanded ? ' is-expanded' : ''
      }`}
      // A seat that stands for a whole repository opens that repository rather
      // than one of its plugins, so the stretched row link steps aside (see
      // `.is-expandable .row-link::after` in styles.css) and the row toggles.
      // Anything the reader can actually click keeps doing its own job; the
      // toggle button below is what makes this reachable from the keyboard.
      onClick={expandable
        ? (event) => {
            if ((event.target as HTMLElement).closest('a, button')) return
            setExpanded((value) => !value)
          }
        : undefined}
    >
      <span className={`row-index${index < 3 && ranking ? ' is-leading' : ''}`} aria-label={`${t('rank')} ${index + 1}`}>
        {String(index + 1).padStart(2, '0')}
      </span>

      <OwnerAvatar owner={plugin.owner} size={36} className="owner-avatar" />

      <div className="row-identity">
        <div className="row-title-line">
          {/* The plugin name is the link text: a row-wide overlay anchor gave
              every one of ~2,900 catalog links the same boilerplate label. */}
          <h3 className="row-title">
            <Link
              className="row-link"
              to={packagePath(plugin)}
              target={ROW_LINK_TARGET}
              rel={ROW_LINK_TARGET ? 'noreferrer' : undefined}
            >
              {listIdentity.displayName}
            </Link>
          </h3>
          <span className="row-owner">{listIdentity.sourceLabel}</span>
          {badge ? <span className="row-badge">{badge}</span> : null}
          {expandable ? (
            // Stars, growth and activity are repository facts, so this row
            // stands for its whole repository. A bare "+23" told the reader a
            // number but not what it meant or that anything could be done with
            // it, so it is a labelled disclosure control instead.
            <button
              type="button"
              className="row-repo-toggle"
              aria-expanded={expanded}
              aria-controls={panelId}
              aria-label={expanded ? t('repoCollapse') : t('repoExpand')}
              onClick={() => setExpanded((value) => !value)}
            >
              <Layers size={12} aria-hidden="true" />
              {siblings.length} {t('repoPluginCount')}
              <ChevronDown className="row-repo-caret" size={13} aria-hidden="true" />
            </button>
          ) : null}
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

      {expandable ? (
        // Spans every grid column so the panel reads as part of the row rather
        // than as a new entry in the list. The children are plain catalog rows:
        // the reader already knows how to read one, and it is the only rendering
        // that gives them the category, the metrics and the install button.
        <div
          className="row-repo-panel"
          id={panelId}
          hidden={!expanded}
          // A click inside the panel belongs to the plugin it landed on, never
          // to the seat's toggle.
          onClick={(event) => event.stopPropagation()}
        >
          {siblings.map((sibling, position) => (
            <PackageRow
              key={sibling.id}
              plugin={sibling}
              category={categories?.get(sibling.category)}
              index={position}
              categories={categories}
              badge={sibling.id === plugin.id ? t('repoThisSeat') : undefined}
            />
          ))}
        </div>
      ) : null}
    </article>
  )
})
