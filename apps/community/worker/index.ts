import { createApp } from './app'

const app = createApp()

const SITE_NAME = 'DSH 1024 广场'
const DEFAULT_TITLE = `${SITE_NAME} · DeepSeek Harness 开发者社区`
const DEFAULT_DESCRIPTION =
  'DeepSeek Harness 插件开发者的公开广场：分享进展、提问、聊插件。用 GitHub 账号登录即可发言。'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** First line of prose, flattened, for a share card. */
function summarise(body: string, maximum = 120): string {
  const flat = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~\[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const characters = [...flat]
  return characters.length <= maximum ? flat : `${characters.slice(0, maximum).join('')}…`
}

interface PageMetadata {
  title: string
  description: string
  canonical: string
  robots: string
}

/**
 * Share cards for a single post, resolved in the Worker.
 *
 * A post is a link people paste into chat, so its `<title>` and `og:` tags have
 * to be right in the first response — a SPA that fills them in after hydration
 * is invisible to every crawler and every chat unfurler. Only the metadata is
 * rendered here; the body itself still arrives with the app.
 */
async function metadataFor(url: URL, env: Env): Promise<PageMetadata> {
  const canonical = `${url.origin}${url.pathname}`
  const postMatch = /^\/p\/(\d+)$/.exec(url.pathname)
  if (postMatch) {
    const id = Number(postMatch[1])
    const row = Number.isSafeInteger(id)
      ? await env.CATALOG_DB.prepare(
          `SELECT p.body, u.github_login
             FROM community_posts p
             JOIN api_users u ON u.id = p.author_id
            WHERE p.id = ? AND p.reply_to_id IS NULL AND p.deleted_at IS NULL`,
        ).bind(id).first<{ body: string; github_login: string }>()
      : null
    if (row) {
      return {
        title: `${summarise(row.body, 40)} — @${row.github_login} · ${SITE_NAME}`,
        description: summarise(row.body),
        canonical,
        robots: 'index,follow',
      }
    }
  }
  const userMatch = /^\/u\/([A-Za-z0-9-]{1,39})$/.exec(url.pathname)
  if (userMatch) {
    return {
      title: `@${userMatch[1]} · ${SITE_NAME}`,
      description: `@${userMatch[1]} 在 ${SITE_NAME} 的发言。`,
      canonical,
      // A profile is a view over posts that are already indexed elsewhere.
      robots: 'noindex,follow',
    }
  }
  return {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    canonical: `${url.origin}/`,
    robots: url.pathname === '/' ? 'index,follow' : 'noindex,follow',
  }
}

function renderHead(metadata: PageMetadata): string {
  const title = escapeHtml(metadata.title)
  const description = escapeHtml(metadata.description)
  const canonical = escapeHtml(metadata.canonical)
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}">`,
    `<meta name="robots" content="${escapeHtml(metadata.robots)}">`,
    `<link rel="canonical" href="${canonical}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${canonical}">`,
    `<meta name="twitter:card" content="summary">`,
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${description}">`,
  ].join('\n    ')
}

async function withMetadata(response: Response, metadata: PageMetadata): Promise<Response> {
  const html = await response.text()
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'no-cache')
  // The replacement is a function, not a string, on purpose. String.replace
  // interprets `$&`, `$'`, `` $` `` and `$n` inside a string replacement, and
  // this one carries post text: a post containing `$'` would splice the rest of
  // the document into its own <head>. Escaping cannot help — escapeHtml has no
  // reason to touch `$` — so the substitution itself has to be literal.
  return new Response(
    html.replace('<!--seo-head-->', () => renderHead(metadata)),
    { status: response.status, headers },
  )
}

const worker = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) return app.fetch(request, env, ctx)

    if (url.pathname === '/robots.txt') {
      return new Response(
        `User-agent: *\nAllow: /\nDisallow: /u/\nSitemap: ${url.origin}/sitemap.xml\n`,
        { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
      )
    }

    const response = await env.ASSETS.fetch(request)
    const isHtml = Boolean(response.headers.get('Content-Type')?.includes('text/html'))
    if (url.pathname.startsWith('/assets/')) {
      if (response.status === 200 && !isHtml) {
        const headers = new Headers(response.headers)
        headers.set('Cache-Control', 'public, max-age=31536000, immutable')
        return new Response(response.body, { status: response.status, headers })
      }
      // A miss under /assets/ is the SPA fallback document, not an asset;
      // serving HTML at a hashed chunk URL would poison a caching client.
      return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } })
    }
    if (!isHtml) return response
    return withMetadata(response, await metadataFor(url, env))
  },
} satisfies ExportedHandler<Env>

export { createApp } from './app'
export default worker
