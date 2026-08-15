import { describe, expect, it } from 'vitest'
import { buildRobotsTxt, buildSitemap, metadataForPath, seoCatalog, type SeoCatalog } from '../worker/seo'
import { TEST_PLUGINS, testCatalogResult } from './fixtures'

function testSeoCatalog(): SeoCatalog {
  return seoCatalog(testCatalogResult().snapshot)
}

describe('SEO metadata', () => {
  it('builds unique canonical metadata for collection and plugin pages', () => {
    const catalogPages = testSeoCatalog()
    const catalog = metadataForPath('/plugin', catalogPages)
    const rankings = metadataForPath('/rankings', catalogPages)
    const plugin = TEST_PLUGINS[0]!
    const detail = metadataForPath(`/plugin/${plugin.owner}/${plugin.repository}`, catalogPages)

    expect(catalog.canonical).toBe('https://deepseek1024.com/plugin')
    expect(rankings.canonical).toBe('https://deepseek1024.com/rankings')
    expect(catalog.title).not.toBe(rankings.title)
    expect(detail.status).toBe(200)
    expect(detail.canonical).toContain(`/plugin/${plugin.owner}/`)
    expect(detail.title).toContain(plugin.name)
    expect(detail.title.length).toBeLessThanOrEqual(60)
    expect(detail.description.length).toBeLessThanOrEqual(160)
  })

  it('brands structured data with the unified site name', () => {
    const rankings = metadataForPath('/rankings', testSeoCatalog())
    expect(JSON.stringify(rankings.schema)).toContain('"name":"DSH 1024Store"')
  })

  it('marks unknown pages as noindex soft-404 replacements', () => {
    const missing = metadataForPath('/plugin/example/missing', testSeoCatalog())
    expect(missing.status).toBe(404)
    expect(missing.robots).toBe('noindex,follow')
  })

  it('lists every snapshot plugin in the sitemap and keeps APIs out of search', () => {
    const sitemap = buildSitemap(testSeoCatalog())
    const urlCount = (sitemap.match(/<url>/g) ?? []).length
    expect(urlCount).toBe(TEST_PLUGINS.length + 2)
    expect(sitemap).toContain('<loc>https://deepseek1024.com/rankings</loc>')
    for (const plugin of TEST_PLUGINS) {
      expect(sitemap).toContain(`/plugin/${encodeURIComponent(plugin.owner)}/${encodeURIComponent(plugin.repository)}</loc>`)
    }
    expect(sitemap).not.toContain('/packages/')
    expect(buildRobotsTxt()).toContain('Disallow: /api/')
  })
})
