import { chromium } from 'playwright'

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:5173'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ locale: 'zh-CN' })
const errors = []

async function openPage(viewport, path) {
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
    () => [...document.querySelectorAll('.header-live strong')].every((node) => node.textContent !== '--'),
    undefined,
    { timeout: 10_000 },
  )
}

try {
  const defaultView = await openPage({ width: 1440, height: 1000 }, '/')
  await defaultView.locator('.ranking-section .package-list').waitFor()
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
  await rankings.locator('.ranking-section .package-list').waitFor()
  if ((await rankings.locator('.directory-section').count()) !== 0) {
    throw new Error('desktop rankings unexpectedly renders the directory')
  }
  if ((await rankings.locator('.ranking-section .package-row').count()) !== 100) {
    throw new Error('rankings did not render the top 100 packages')
  }
  if ((await rankings.locator('.ranking-section .segmented-control button').count()) !== 6) {
    throw new Error('rankings should expose growth, stars, release, and activity modes')
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
  if ((await rankings.locator('header .github-link[href="https://github.com/imsai-sh/awesome-deepseek-harness-plugins"]').count()) !== 1) {
    throw new Error('GitHub repository link is missing from the desktop header')
  }
  if ((await rankings.locator('header .header-submit[href="/CONTRIBUTING.md"]').count()) !== 1) {
    throw new Error('submit button does not link to the contribution guide')
  }
  if ((await rankings.locator('header a[href^="/plugin"], header a[href^="/rankings"]').count()) !== 1) {
    throw new Error('internal view navigation is duplicated in the header')
  }
  if ((await rankings.locator('a[href^="/plugin/"]').count()) === 0) {
    throw new Error('catalog cards do not use the canonical singular plugin path')
  }
  if ((await rankings.locator('footer, .reset-button').count()) !== 0) {
    throw new Error('removed footer or refresh control is still rendered')
  }
  await assertSeo(rankings, 'desktop rankings', '/rankings')
  await rankings.locator('.ranking-section .segmented-control button').last().click()
  await rankings.locator('.ranking-section .package-row').first().waitFor()
  const rankingSearchResponse = rankings.waitForResponse(
    (response) => response.url().includes('/api/plugin?') && response.url().includes('q=crosstalk'),
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

  const mobile = await openPage({ width: 390, height: 844 }, '/plugin')
  await mobile.locator('.directory-section .package-list').waitFor()
  await assertLiveStats(mobile)
  await assertNoHorizontalOverflow(mobile, 'mobile catalog')

  const searchResponse = mobile.waitForResponse(
    (response) => response.url().includes('/api/plugin?') && response.url().includes('q=crosstalk'),
  )
  await mobile.locator('input[type="search"]').fill('crosstalk')
  await searchResponse
  await assertSeo(mobile, 'filtered mobile catalog', '/plugin', 'noindex,follow')
  if ((await mobile.locator('.directory-section .package-row').count()) === 0) {
    throw new Error('search returned no package rows')
  }
  await mobile.close()

  const mobileRankings = await openPage({ width: 390, height: 844 }, '/rankings')
  await mobileRankings.locator('.ranking-section .package-list').waitFor()
  await assertNoHorizontalOverflow(mobileRankings, 'mobile rankings')
  await mobileRankings.close()

  const detail = await openPage({ width: 1440, height: 1000 }, '/plugin/openma-ai/deepseek-harness-tui')
  await detail.locator('.detail-header').waitFor()
  await assertSeo(detail, 'desktop detail', '/plugin/openma-ai/deepseek-harness-tui')
  await assertNoHorizontalOverflow(detail, 'desktop detail')
  await detail.close()

  const scoped = await openPage({ width: 390, height: 844 }, '/plugin/zhaoolee/notes')
  await scoped.locator('.detail-header').waitFor()
  await assertNoHorizontalOverflow(scoped, 'scoped package detail')
  await scoped.close()

  if (errors.length > 0) throw new Error(`browser errors:\n${errors.join('\n')}`)
  console.log('Visual smoke check passed: separate directory/rankings views, live stats, desktop, mobile, search, and package details.')
} finally {
  await context.close()
  await browser.close()
}
