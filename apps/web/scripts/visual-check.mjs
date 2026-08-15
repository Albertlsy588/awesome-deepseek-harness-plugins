import { chromium } from 'playwright'

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:5173'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const desktopContext = await browser.newContext({ locale: 'zh-CN' })
const mobileContext = await browser.newContext({
  locale: 'zh-CN',
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: true,
  permissions: ['clipboard-read', 'clipboard-write'],
})
const errors = []

async function openPage(viewport, path, { touch = false } = {}) {
  const context = touch ? mobileContext : desktopContext
  const page = await context.newPage()
  await page.setViewportSize(viewport)
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' })
  return page
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  )
  if (overflow) throw new Error(`${label} has horizontal overflow`)
}

async function assertMobileEnvironment(page, label) {
  const result = await page.evaluate(() => ({
    maxTouchPoints: navigator.maxTouchPoints,
    viewport: document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '',
  }))
  if (result.maxTouchPoints < 1) throw new Error(`${label} is not running with touch input`)
  if (!result.viewport.includes('width=device-width')) {
    throw new Error(`${label} is missing a device-width viewport declaration`)
  }
}

async function assertMinTouchTargets(page, label, selectors) {
  const undersized = await page.locator(selectors.join(', ')).evaluateAll((nodes) =>
    nodes
      .filter((node) => {
        const style = getComputedStyle(node)
        const box = node.getBoundingClientRect()
        return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0
      })
      .map((node) => {
        const box = node.getBoundingClientRect()
        return {
          height: Math.round(box.height),
          label: node.getAttribute('aria-label') ?? node.textContent?.trim().slice(0, 40) ?? node.tagName,
          width: Math.round(box.width),
        }
      })
      .filter(({ height, width }) => height < 44 || width < 44),
  )
  if (undersized.length > 0) {
    throw new Error(`${label} has touch targets smaller than 44px: ${JSON.stringify(undersized)}`)
  }
}

async function assertMinFontSize(page, label, selector, minimum) {
  const size = await page.locator(selector).first().evaluate((node) => parseFloat(getComputedStyle(node).fontSize))
  if (size < minimum) throw new Error(`${label} uses ${size}px text; expected at least ${minimum}px`)
}

async function assertHorizontalTouchScroller(page, label, selector) {
  const result = await page.locator(selector).evaluate((node) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
    touchAction: getComputedStyle(node).touchAction,
  }))
  if (result.scrollWidth <= result.clientWidth) {
    throw new Error(`${label} does not expose its overflowing controls through a local scroller`)
  }
  if (!result.touchAction.includes('pan-x')) {
    throw new Error(`${label} is missing horizontal touch panning`)
  }
}

async function assertSeo(page, label, canonicalPath, robots = 'index,follow') {
  const result = await page.evaluate(() => ({
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    description: document.querySelector('meta[name="description"]')?.getAttribute('content'),
    h1Count: document.querySelectorAll('h1').length,
    robots: document.querySelector('meta[name="robots"]')?.getAttribute('content'),
    title: document.title,
  }))
  if (result.canonical !== `https://deepseek1024.com${canonicalPath}`) {
    throw new Error(`${label} has an incorrect canonical URL: ${result.canonical}`)
  }
  if (!result.description || result.description.length < 50) {
    throw new Error(`${label} is missing a useful meta description`)
  }
  if (result.h1Count !== 1) throw new Error(`${label} should render exactly one H1`)
  if (result.robots !== robots) throw new Error(`${label} has incorrect robots metadata`)
  if (!result.title || result.title === 'DeepSeek Harness Store') {
    throw new Error(`${label} is missing page-specific title metadata`)
  }
}

async function assertLiveStats(page) {
  await page.waitForFunction(
    () => [...document.querySelectorAll('.hero-live dd')].every((node) => node.textContent !== '--'),
    undefined,
    { timeout: 10_000 },
  )
}

try {
  const defaultView = await openPage({ width: 1440, height: 1000 }, '/')
  await defaultView.locator('.ranking-section').waitFor()
  if (!defaultView.url().endsWith('/rankings')) {
    throw new Error('root route did not default to rankings')
  }
  await defaultView.close()

  const desktop = await openPage({ width: 1440, height: 1000 }, '/plugin')
  await desktop.locator('.directory-section .package-list').waitFor()
  if ((await desktop.locator('.ranking-section').count()) !== 0) {
    throw new Error('desktop catalog unexpectedly renders rankings')
  }
  if ((await desktop.locator('.directory-section .sort-segments button').count()) !== 3) {
    throw new Error('directory sort controls should only contain stars, newest, and active')
  }
  await assertLiveStats(desktop)
  await assertSeo(desktop, 'desktop catalog', '/plugin')
  await assertNoHorizontalOverflow(desktop, 'desktop catalog')
  await desktop.close()

  const rankings = await openPage({ width: 1440, height: 1000 }, '/rankings')
  await rankings.locator('.ranking-section').waitFor()
  if ((await rankings.locator('.directory-section').count()) !== 0) {
    throw new Error('desktop rankings unexpectedly renders the directory')
  }
  if ((await rankings.locator('.ranking-section .segmented-control button').count()) !== 6) {
    throw new Error('rankings should only expose the six GitHub activity modes')
  }
  if (await rankings.locator('.ranking-section .segmented-control button').nth(3).getAttribute('aria-pressed') !== 'true') {
    throw new Error('rankings should default to stars')
  }
  if ((await rankings.locator('header a[href="https://www.deepseek.com/harness/"]').count()) !== 0) {
    throw new Error('official Harness link should not be rendered in the header')
  }
  if ((await rankings.locator('.site-bottom-link a[href="https://www.deepseek.com/harness/"]').count()) !== 1) {
    throw new Error('official Harness link is missing from the page bottom')
  }
  if (!(await rankings.locator('.site-bottom-link p').textContent())?.includes('DeepSeek')) {
    throw new Error('unofficial project notice is missing from the page bottom')
  }
  if ((await rankings.locator('.catalog-hero .github-link[href="https://github.com/imsai-sh/awesome-deepseek-harness-plugins"]').count()) !== 1) {
    throw new Error('GitHub repository link is missing from the catalog banner')
  }
  if ((await rankings.locator('.catalog-hero .hero-submit[href="https://github.com/imsai-sh/awesome-deepseek-harness-plugins"][target="_blank"]').count()) !== 1) {
    throw new Error('submit button does not link to the GitHub repository')
  }
  if ((await rankings.locator('.catalog-hero a.hero-brand[href="/"]').count()) !== 1) {
    throw new Error('banner brand does not link to the home page')
  }
  if ((await rankings.locator('.site-header').count()) !== 0) {
    throw new Error('the removed standalone site header is still rendered')
  }
  if ((await rankings.locator('.catalog-hero .hero-brand-copy small').textContent())?.trim() !== 'DSH 1024Store') {
    throw new Error('catalog banner is missing the DSH 1024Store brand')
  }
  if ((await rankings.locator('footer, .reset-button').count()) !== 0) {
    throw new Error('removed footer or refresh control is still rendered')
  }
  await assertSeo(rankings, 'desktop rankings', '/rankings')
  await rankings.locator('.ranking-section .segmented-control button').last().click()
  await rankings.locator('.ranking-section .package-row').first().waitFor()
  if ((await rankings.locator('.ranking-section .package-row').count()) !== 100) {
    throw new Error('GitHub activity rankings did not render the top 100 packages')
  }
  if ((await rankings.locator('a[href^="/plugin/"]').count()) === 0) {
    throw new Error('catalog cards do not use the canonical singular plugin path')
  }
  const rankingSearchResponse = rankings.waitForResponse(
    (response) => response.url().includes('/api/v1/plugins?') && response.url().includes('q=crosstalk'),
  )
  await rankings.locator('input[type="search"]').fill('crosstalk')
  await rankingSearchResponse
  await rankings.waitForFunction(
    () => document.querySelectorAll('.ranking-section .package-row').length === 1,
    undefined,
    { timeout: 5_000 },
  )
  if ((await rankings.locator('.ranking-section .package-row').count()) !== 1) {
    throw new Error('ranking search did not filter the visible ranking')
  }
  await assertNoHorizontalOverflow(rankings, 'desktop rankings')
  await rankings.close()

  const mobile = await openPage({ width: 390, height: 844 }, '/plugin', { touch: true })
  await mobile.locator('.directory-section .package-list').waitFor()
  await assertLiveStats(mobile)
  await assertMobileEnvironment(mobile, 'mobile catalog')
  await assertNoHorizontalOverflow(mobile, 'mobile catalog')
  await assertMinTouchTargets(mobile, 'mobile catalog', [
    '.catalog-hero .hero-brand',
    '.catalog-hero .github-link',
    '.catalog-hero .hero-submit',
    '.catalog-hero .hero-language button',
    '.catalog-view-tabs a',
    '.category-filter button',
    '.segmented-control button',
    '.package-row .icon-button',
    '.package-row .row-open',
  ])
  await assertMinFontSize(mobile, 'mobile search input', 'input[type="search"]', 16)
  await assertMinFontSize(mobile, 'mobile package title', '.row-title-line a', 14)
  await assertMinFontSize(mobile, 'mobile package description', '.row-identity p', 12)
  await assertMinFontSize(mobile, 'mobile package metrics', '.row-metrics > span', 11)
  await assertMinFontSize(mobile, 'mobile hero description', '.hero-heading > p:last-child', 14)
  await assertMinFontSize(mobile, 'mobile hero ledger labels', '.hero-ledger dt', 11)
  await assertHorizontalTouchScroller(mobile, 'mobile category filters', '.category-filter')

  await mobile.locator('.category-filter button').nth(1).click()
  await mobile.waitForURL((url) => url.searchParams.has('category'))
  await mobile.locator('.category-filter button').first().click()
  await mobile.waitForURL((url) => !url.searchParams.has('category'))

  const searchResponse = mobile.waitForResponse(
    (response) => response.url().includes('/api/v1/plugins?') && response.url().includes('q=crosstalk'),
  )
  await mobile.locator('input[type="search"]').fill('crosstalk')
  await searchResponse
  await assertSeo(mobile, 'filtered mobile catalog', '/plugin', 'noindex,follow')
  if ((await mobile.locator('.directory-section .package-row').count()) === 0) {
    throw new Error('search returned no package rows')
  }
  await mobile.locator('.directory-section .package-row .icon-button').first().click()
  await mobile.locator('.directory-section .package-row .icon-button[aria-label="已复制"]').waitFor()
  await mobile.locator('.catalog-hero .language-switch button').last().click()
  await mobile.waitForFunction(() => document.documentElement.lang === 'en')
  await assertNoHorizontalOverflow(mobile, 'English mobile catalog')
  await mobile.locator('.catalog-hero .language-switch button').first().click()
  await mobile.waitForFunction(() => document.documentElement.lang === 'zh-CN')
  await mobile.close()

  const mobileRankings = await openPage({ width: 390, height: 844 }, '/rankings', { touch: true })
  await mobileRankings.locator('.ranking-section .package-list').waitFor()
  await assertMobileEnvironment(mobileRankings, 'mobile rankings')
  await assertNoHorizontalOverflow(mobileRankings, 'mobile rankings')
  await assertMinTouchTargets(mobileRankings, 'mobile rankings', [
    '.catalog-view-tabs a',
    '.segmented-control button',
    '.package-row .row-open',
  ])
  await assertHorizontalTouchScroller(
    mobileRankings,
    'mobile GitHub ranking modes',
    '.ranking-mode-group:last-child .segmented-control',
  )
  await mobileRankings.locator('.ranking-section .segmented-control button').last().click()
  if (await mobileRankings.locator('.ranking-section .segmented-control button').last().getAttribute('aria-pressed') !== 'true') {
    throw new Error('mobile ranking controls could not select an offscreen mode')
  }
  await mobileRankings.close()

  const detail = await openPage({ width: 1440, height: 1000 }, '/plugin/openma-ai/deepseek-harness-tui')
  await detail.locator('.detail-header').waitFor()
  await detail.locator('.install-activity-section').waitFor()
  if (!(await detail.locator('.install-section .install-command code').first().textContent())?.includes('@dsh-1024store/cli')) {
    throw new Error('detail page is missing the tracked wrapper CLI command')
  }
  await assertSeo(detail, 'desktop detail', '/plugin/openma-ai/deepseek-harness-tui')
  await assertNoHorizontalOverflow(detail, 'desktop detail')
  await detail.locator('.detail-brand').click()
  await detail.waitForURL('**/rankings')
  await detail.locator('.ranking-section').waitFor()
  await detail.close()

  const scoped = await openPage({ width: 390, height: 844 }, '/plugin/zhaoolee/notes', { touch: true })
  await scoped.locator('.detail-header').waitFor()
  await assertMobileEnvironment(scoped, 'mobile package detail')
  await assertNoHorizontalOverflow(scoped, 'scoped package detail')
  await assertMinTouchTargets(scoped, 'mobile package detail', [
    '.detail-brand',
    '.detail-utility .language-switch button',
    '.back-link',
    '.detail-actions .button',
    '.install-command-prominent .icon-button',
    '.site-bottom-link a',
  ])
  await assertMinFontSize(scoped, 'mobile detail prose', '.detail-description', 15)
  await assertMinFontSize(scoped, 'mobile README prose', '.markdown-body', 15)
  await assertMinFontSize(scoped, 'mobile package facts', '.package-facts dd', 13)
  const detailOrder = await scoped.evaluate(() => ({
    install: document.querySelector('.install-section')?.getBoundingClientRect().top,
    installActivity: document.querySelector('.install-activity-section')?.getBoundingClientRect().top,
    primary: document.querySelector('.detail-primary')?.getBoundingClientRect().top,
    readme: document.querySelector('.readme-section')?.getBoundingClientRect().top,
    sidebar: document.querySelector('.package-sidebar')?.getBoundingClientRect().top,
  }))
  if (
    detailOrder.install === undefined
    || detailOrder.installActivity === undefined
    || detailOrder.primary === undefined
    || detailOrder.sidebar === undefined
    || detailOrder.readme === undefined
    || !(
      detailOrder.primary <= detailOrder.install
      && detailOrder.install < detailOrder.installActivity
      && detailOrder.installActivity < detailOrder.sidebar
      && detailOrder.sidebar < detailOrder.readme
    )
  ) {
    throw new Error(`mobile detail content priority is incorrect: ${JSON.stringify(detailOrder)}`)
  }
  await scoped.locator('.install-command-prominent .icon-button').click()
  await scoped.locator('.install-command-prominent .icon-button[aria-label="已复制"]').waitFor()
  await scoped.locator('.detail-brand').click()
  await scoped.waitForURL('**/rankings')
  await scoped.locator('.ranking-section').waitFor()
  await scoped.close()

  const compactMobile = await openPage({ width: 320, height: 568 }, '/rankings', { touch: true })
  await compactMobile.locator('.ranking-section .package-list').waitFor()
  await assertNoHorizontalOverflow(compactMobile, 'compact mobile rankings')
  if (await compactMobile.locator('.catalog-hero .hero-language').isVisible()) {
    throw new Error('compact mobile header did not hide the secondary language control')
  }
  await assertMinTouchTargets(compactMobile, 'compact mobile header', [
    '.catalog-hero .hero-brand',
    '.catalog-hero .github-link',
    '.catalog-hero .hero-submit',
    '.catalog-view-tabs a',
    '.package-row .row-open',
  ])
  await compactMobile.close()

  if (errors.length > 0) throw new Error(`browser errors:\n${errors.join('\n')}`)
  console.log('Visual smoke check passed: desktop, touch-enabled 390px mobile, compact 320px mobile, search, copy actions, local scrollers, and package details.')
} finally {
  await desktopContext.close()
  await mobileContext.close()
  await browser.close()
}
