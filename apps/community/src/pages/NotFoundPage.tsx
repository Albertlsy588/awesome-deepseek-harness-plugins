import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'

export function NotFoundPage() {
  const { t } = useI18n()
  return (
    <div className="feed-state">
      <p>{t('notFound')}</p>
      <Link className="button-secondary" to="/">{t('backToFeed')}</Link>
    </div>
  )
}
