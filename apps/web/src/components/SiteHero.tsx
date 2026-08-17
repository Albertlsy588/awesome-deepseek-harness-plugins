import { publicAsset } from '../lib/assets'
import { formatNumber } from '../lib/format'
import { useI18n } from '../lib/i18n'
import type { Language } from '../lib/api'

interface SiteHeroProps {
  total: number | null
  liveCount: number | null
  /** Whether the live socket is up; a stale count should not look live. */
  connected: boolean
  language: Language
}

/**
 * The whale, the wordmark, and the two numbers that say the catalog is alive.
 *
 * It appears on the rankings page only. `/` is where search traffic lands and
 * needs the introduction; `/plugins` is a working page, and the same hero on
 * both was the site introducing itself to people already inside it.
 *
 * The two figures are what earn the space: "N plugins that passed the spec
 * check" and a live viewer count say this is a reviewed, active index rather
 * than another awesome-list. The wordmark could shrink; those cannot.
 */
export function SiteHero({ total, liveCount, connected, language }: SiteHeroProps) {
  const { t } = useI18n()

  return (
    <section className="site-hero" aria-labelledby="site-hero-name">
      <img
        className="site-hero-whale"
        src={publicAsset('deepseek1024.png')}
        alt=""
        aria-hidden="true"
        width={104}
        height={104}
      />
      <div className="site-hero-copy">
        <div className="site-hero-eyebrow">DeepSeek Harness Plugin</div>
        <div className="site-hero-name" id="site-hero-name">1024Store</div>
        <p className="site-hero-desc">{t('subtitle')}</p>
      </div>
      <dl className="site-hero-figures">
        <div className="site-hero-figure">
          <dd>{total === null ? '—' : formatNumber(total, language)}</dd>
          <dt>{t('totalPlugins')}</dt>
        </div>
        <div className="site-hero-figure is-live">
          <dd>{liveCount === null ? '—' : formatNumber(liveCount, language)}</dd>
          <dt>
            <span className={connected ? 'live-dot is-connected' : 'live-dot'} aria-hidden="true" />
            {t('online')}
          </dt>
        </div>
      </dl>
    </section>
  )
}
