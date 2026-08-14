import { useEffect } from 'react'
import type { Language } from './api'

export const SITE_ORIGIN = 'https://deepseek1024.com'
const SITE_NAME = 'DeepSeek Harness Plugin Store'
const DEFAULT_IMAGE = `${SITE_ORIGIN}/deepseek1024-icon.png`

interface PageSeoOptions {
  title: string
  description: string
  path: string
  language: Language
  robots?: 'index,follow' | 'noindex,follow'
  schema?: object | null
}

function normalizedText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function fitSeoText(value: string, maxLength: number): string {
  const normalized = normalizedText(value)
  if (normalized.length <= maxLength) return normalized

  const candidate = normalized.slice(0, maxLength - 1).trimEnd()
  const lastSpace = candidate.lastIndexOf(' ')
  const boundary = lastSpace >= Math.floor(maxLength * 0.7) ? lastSpace : candidate.length
  return `${candidate.slice(0, boundary).replace(/[.,;:!?，。；：！？-]+$/, '')}…`
}

function setMeta(attribute: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, key)
    document.head.append(element)
  }
  element.content = content
}

function setCanonical(url: string) {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!element) {
    element = document.createElement('link')
    element.rel = 'canonical'
    document.head.append(element)
  }
  element.href = url
}

export function usePageSeo({
  title,
  description,
  path,
  language,
  robots = 'index,follow',
  schema = null,
}: PageSeoOptions) {
  const schemaJson = schema ? JSON.stringify(schema) : ''

  useEffect(() => {
    const canonical = new URL(path, SITE_ORIGIN).toString()
    const locale = language === 'zh' ? 'zh_CN' : 'en_US'

    document.title = title
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
    setCanonical(canonical)
    setMeta('name', 'description', description)
    setMeta('name', 'robots', robots)
    setMeta('property', 'og:type', 'website')
    setMeta('property', 'og:site_name', SITE_NAME)
    setMeta('property', 'og:title', title)
    setMeta('property', 'og:description', description)
    setMeta('property', 'og:url', canonical)
    setMeta('property', 'og:image', DEFAULT_IMAGE)
    setMeta('property', 'og:image:alt', SITE_NAME)
    setMeta('property', 'og:locale', locale)
    setMeta('name', 'twitter:card', 'summary')
    setMeta('name', 'twitter:title', title)
    setMeta('name', 'twitter:description', description)
    setMeta('name', 'twitter:image', DEFAULT_IMAGE)

    let schemaElement = document.head.querySelector<HTMLScriptElement>('script[data-seo-schema]')
    if (!schemaJson) {
      schemaElement?.remove()
      return
    }
    if (!schemaElement) {
      schemaElement = document.createElement('script')
      schemaElement.type = 'application/ld+json'
      schemaElement.dataset.seoSchema = ''
      document.head.append(schemaElement)
    }
    schemaElement.textContent = schemaJson
  }, [description, language, path, robots, schemaJson, title])
}
