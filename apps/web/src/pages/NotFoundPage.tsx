import { ArrowLeft, SearchX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'

export function NotFoundPage() {
  const { t } = useI18n()
  return (
    <div className="page-container standalone-state">
      <SearchX size={36} aria-hidden="true" />
      <h1>{t('notFound')}</h1>
      <p>{t('notFoundBody')}</p>
      <Link className="button button-primary" to="/plugin">
        <ArrowLeft size={16} aria-hidden="true" />
        {t('back')}
      </Link>
    </div>
  )
}
