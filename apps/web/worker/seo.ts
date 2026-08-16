import { findPluginById } from './lib/catalog'
import { pluginDetailPath } from './lib/plugin-id'
import type { RegistryPlugin, StoredCatalogSnapshot } from './types'

export const SITE_ORIGIN = 'https://deepseek1024.com'
const SITE_NAME = 'DSH 1024Store'
const DEFAULT_IMAGE = `${SITE_ORIGIN}/deepseek1024-icon.png`

/** The slice of the runtime catalog snapshot the SEO surfaces render from. */
export interface SeoCatalog {
  updated: string
  plugins: RegistryPlugin[]
}

export function seoCatalog(snapshot: StoredCatalogSnapshot): SeoCatalog {
  return { updated: snapshot.registryUpdated, plugins: snapshot.plugins }
}

export interface PageMetadata {
  title: string
  description: string
  canonical: string
  robots: 'index,follow' | 'noindex,follow'
  schema: object
  status: 200 | 404
}

function fitText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  const candidate = normalized.slice(0, maxLength - 1).trimEnd()
  const lastSpace = candidate.lastIndexOf(' ')
  const boundary = lastSpace >= Math.floor(maxLength * 0.7) ? lastSpace : candidate.length
  return `${candidate.slice(0, boundary).replace(/[.,;:!?-]+$/, '')}…`
}

function absolute(path: string): string {
  return new URL(path, SITE_ORIGIN).toString()
}

function collectionSchema(name: string, description: string, path: string): object {
  const url = absolute(path)
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${url}#webpage`,
    url,
    name,
    description,
    isPartOf: {
      '@type': 'WebSite',
      '@id': `${SITE_ORIGIN}/#website`,
      name: SITE_NAME,
      url: `${SITE_ORIGIN}/`,
    },
  }
}

function pluginSchema(plugin: RegistryPlugin, canonical: string, description: string): object {
  const softwareId = `${canonical}#software`
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${canonical}#webpage`,
        url: canonical,
        name: plugin.name,
        description,
        isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
        mainEntity: { '@id': softwareId },
      },
      {
        '@type': 'SoftwareSourceCode',
        '@id': softwareId,
        name: plugin.name,
        description: plugin.description.en,
        codeRepository: plugin.url,
        runtimePlatform: 'DeepSeek Harness',
        dateCreated: plugin.added,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Plugin catalog',
            item: `${SITE_ORIGIN}/plugins`,
          },
          { '@type': 'ListItem', position: 2, name: plugin.name, item: canonical },
        ],
      },
    ],
  }
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

export function metadataForPath(
  pathname: string,
  catalog: SeoCatalog,
): PageMetadata {
  if (pathname === '/' || pathname === '/rankings') {
    const title = 'DeepSeek Harness Plugin Rankings | DSH 1024Store'
    const description = 'Compare popular DeepSeek Harness plugins by GitHub stars, recent growth, releases, and repository activity in the community plugin rankings.'
    return {
      title,
      description,
      canonical: absolute('/'),
      robots: 'index,follow',
      schema: collectionSchema(title, description, '/'),
      status: 200,
    }
  }

  if (pathname === '/plugins') {
    const title = 'DeepSeek Harness Plugins & Extensions | DSH 1024Store'
    const description = 'Browse curated DeepSeek Harness plugins and extensions. Compare GitHub activity, explore categories, and copy install commands from the community catalog.'
    return {
      title,
      description,
      canonical: absolute('/plugins'),
      robots: 'index,follow',
      schema: collectionSchema(title, description, '/plugins'),
      status: 200,
    }
  }

  if (pathname === '/docs/api') {
    const title = 'Developer API | DSH 1024Store'
    const description = 'Search the DeepSeek Harness community plugin catalog over a public REST API with GitHub-login API keys and transparent rate limits.'
    return {
      title,
      description,
      canonical: absolute('/docs/api'),
      robots: 'index,follow',
      schema: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        url: absolute('/docs/api'),
        name: title,
        description,
      },
      status: 200,
    }
  }

  if (pathname === '/account') {
    const title = 'Account & API keys | DSH 1024Store'
    const description = 'Manage your DSH 1024Store account and developer API keys.'
    return {
      title,
      description,
      canonical: absolute('/account'),
      robots: 'noindex,follow',
      schema: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        url: absolute('/account'),
        name: title,
        description,
      },
      status: 200,
    }
  }

  // Any depth: a monorepo plugin's detail path carries its in-repo directory.
  // Without this the page would be served as a 404 + noindex shell.
  const match = pathname.match(/^\/plugins\/([^/]+(?:\/[^/]+)+)\/?$/)
  if (match) {
    const segments = (match[1] ?? '').split('/').map(safeDecode)
    const requestedId = segments.every((segment) => segment !== null && segment.length > 0)
      ? segments.join('/')
      : ''
    const plugin = requestedId ? findPluginById(catalog.plugins, requestedId) : undefined
    if (plugin) {
      const canonicalPath = pluginDetailPath(plugin.id)
      const canonical = absolute(canonicalPath)
      const title = fitText(`${plugin.name} DeepSeek Harness Plugin | DSH 1024Store`, 60)
      const description = fitText(
        `Explore ${plugin.name}, a DeepSeek Harness plugin by ${plugin.owner}. ${plugin.description.en}`,
        160,
      )
      return {
        title,
        description,
        canonical,
        robots: 'index,follow',
        schema: pluginSchema(plugin, canonical, description),
        status: 200,
      }
    }
  }

  const title = 'Page not found | DSH 1024Store'
  const description = 'The requested page is not available in the DeepSeek Harness community plugin catalog.'
  return {
    title,
    description,
    canonical: absolute(pathname),
    robots: 'noindex,follow',
    schema: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      url: absolute(pathname),
      name: title,
    },
    status: 404,
  }
}

function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export function buildSitemap(catalog: SeoCatalog): string {
  const pages = [
    { path: '/', lastModified: catalog.updated },
    { path: '/plugins', lastModified: catalog.updated },
    { path: '/docs/api', lastModified: catalog.updated },
    ...catalog.plugins.map((plugin) => ({
      path: pluginDetailPath(plugin.id),
      lastModified: plugin.added,
    })),
  ]
  const urls = pages.map(({ path, lastModified }) => [
    '  <url>',
    `    <loc>${xmlEscape(absolute(path))}</loc>`,
    `    <lastmod>${xmlEscape(lastModified)}</lastmod>`,
    '  </url>',
  ].join('\n')).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

export function buildRobotsTxt(): string {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    `Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
    '',
  ].join('\n')
}

export function rewriteHtmlResponse(response: Response, metadata: PageMetadata): Response {
  const rewriter = new HTMLRewriter()
    .on('title', {
      element(element) {
        element.setInnerContent(metadata.title)
      },
    })
    .on('meta[name="description"]', {
      element(element) {
        element.setAttribute('content', metadata.description)
      },
    })
    .on('meta[name="robots"]', {
      element(element) {
        element.setAttribute('content', metadata.robots)
      },
    })
    .on('meta[property="og:title"], meta[name="twitter:title"]', {
      element(element) {
        element.setAttribute('content', metadata.title)
      },
    })
    .on('meta[property="og:description"], meta[name="twitter:description"]', {
      element(element) {
        element.setAttribute('content', metadata.description)
      },
    })
    .on('meta[property="og:url"]', {
      element(element) {
        element.setAttribute('content', metadata.canonical)
      },
    })
    .on('meta[property="og:image"], meta[name="twitter:image"]', {
      element(element) {
        element.setAttribute('content', DEFAULT_IMAGE)
      },
    })
    .on('link[rel="canonical"]', {
      element(element) {
        element.setAttribute('href', metadata.canonical)
      },
    })
    .on('script[data-seo-schema]', {
      element(element) {
        const json = JSON.stringify(metadata.schema).replaceAll('<', '\\u003c')
        element.setInnerContent(json, { html: true })
      },
    })

  const transformed = rewriter.transform(response)
  const headers = new Headers(transformed.headers)
  headers.set('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600')
  headers.set('X-Robots-Tag', metadata.robots)
  return new Response(transformed.body, {
    status: metadata.status,
    headers,
  })
}
