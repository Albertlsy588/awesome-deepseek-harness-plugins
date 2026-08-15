import type { Language } from './api'

export function formatDate(value: string, language: Language): string {
  const dateOnly = value.length === 10
  const date = new Date(dateOnly ? `${value}T00:00:00Z` : value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    // Date-only strings have no clock time to localize; keep them in UTC so the
    // calendar date never shifts for viewers west of UTC.
    ...(dateOnly ? { timeZone: 'UTC' } : {}),
  }).format(date)
}

export function formatDateTime(value: string, language: Language): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date)
}

export function formatNumber(value: number, language: Language): string {
  return new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en', {
    notation: value >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value)
}
