import { describe, expect, it } from 'vitest'
import { BUNDLED_REGISTRY } from '../worker/lib/registry'
import { buildRobotsTxt, buildSitemap, metadataForPath } from '../worker/seo'

describe('SEO metadata', () => {
  it('builds unique canonical metadata for collection and plugin pages', () => {
    const catalog = metadataForPath('/plugin')
    const rankings = metadataForPath('/rankings')
    const plugin = BUNDLED_REGISTRY.plugins[0]
    const detail = metadataForPath(`/plugin/${plugin.owner}/${new URL(plugin.url).pathname.split('/')[2]}`)

    expect(catalog.canonical).toBe('https://deepseek1024.com/plugin')
    expect(rankings.canonical).toBe('https://deepseek1024.com/rankings')
    expect(catalog.title).not.toBe(rankings.title)
    expect(detail.status).toBe(200)
    expect(detail.canonical).toContain(`/plugin/${plugin.owner}/`)
    expect(detail.title).toContain(plugin.name)
    expect(detail.title.length).toBeLessThanOrEqual(60)
    expect(detail.description.length).toBeLessThanOrEqual(160)
  })

  it('marks unknown pages as noindex soft-404 replacements', () => {
    const missing = metadataForPath('/plugin/example/missing')
    expect(missing.status).toBe(404)
    expect(missing.robots).toBe('noindex,follow')
  })

  it('lists every canonical page in the sitemap and keeps APIs out of search', () => {
    const sitemap = buildSitemap()
    const urlCount = (sitemap.match(/<url>/g) ?? []).length
    expect(urlCount).toBe(BUNDLED_REGISTRY.plugins.length + 2)
    expect(sitemap).toContain('<loc>https://deepseek1024.com/rankings</loc>')
    expect(sitemap).not.toContain('/packages/')
    expect(buildRobotsTxt()).toContain('Disallow: /api/')
  })
})
