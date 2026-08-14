import type { CategoryResult } from '../lib/api'
import { useI18n } from '../lib/i18n'

export function CategoryTag({ category }: { category?: CategoryResult }) {
  const { language } = useI18n()
  if (!category) return null
  return (
    <span className={`category-tag category-${category.id}`}>
      <span className="category-dot" aria-hidden="true" />
      {category[language]}
    </span>
  )
}

