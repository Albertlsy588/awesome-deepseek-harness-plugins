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
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`)
  })
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
      errors.push(`${page.url()}: ${message.text()}`)
    }
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

async function assertHorizontalTouchScroller(page, label, selector, { requireOverflow = true } = {}) {
  const result = await page.locator(selector).evaluate((node) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
    touchAction: getComputedStyle(node).touchAction,
  }))
  if (result.scrollWidth <= result.clientWidth) {
    if (requireOverflow) {
      throw new Error(`${label} does not expose its overflowing controls through a local scroller`)
    }
    // Content fits without scrolling; nothing to pan.
    return
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

// The rankings view defaults to the 24h growth mode, which is legitimately
// empty until enough star-history snapshots exist (e.g. a freshly seeded local
// environment). Fall back to the stars mode so layout assertions can proceed.
async function waitForRankingList(page) {
  await page.locator('.ranking-section').waitFor()
  await page
    .locator('.ranking-section .package-list, .ranking-section .state-panel')
    .first()
    .waitFor()
  if ((await page.locator('.ranking-section .package-list').count()) === 0) {
    await page.locator('.ranking-section .segmented-control button').nth(1).click()
    await page.locator('.ranking-section .package-list').waitFor()
  }
}

async function assertLiveStats(page) {
  await page.waitForFunction(
    () => [...document.querySelectorAll('.hero-live-count')].every((node) => node.textContent !== '--'),
    undefined,
    { timeout: 10_000 },
  )
}

try {
  const defaultView = await openPage({ width: 1440, height: 1000 }, '/')
  await defaultView.locator('.ranking-section').waitFor()
  if (new URL(defaultView.url()).pathname !== '/') {
    throw new Error('root route changed the visible URL while rendering rankings')
  }
  await assertSeo(defaultView, 'default rankings', '/')
  await defaultView.close()

  const legacyCatalog = await openPage({ width: 1440, height: 1000 }, '/plugin?q=crosstalk')
  if (new URL(legacyCatalog.url()).pathname !== '/plugins' || new URL(legacyCatalog.url()).searchParams.get('q') !== 'crosstalk') {
    throw new Error('singular plugin route did not preserve its query while redirecting to /plugins')
  }
  await legacyCatalog.close()

  const desktop = await openPage({ width: 1440, height: 1000 }, '/plugins')
  await desktop.locator('.directory-section .package-list').waitFor()
  if ((await desktop.locator('.ranking-section').count()) !== 0) {
    throw new Error('desktop catalog unexpectedly renders rankings')
  }
  if ((await desktop.locator('.directory-section .sort-segments button').count()) !== 3) {
    throw new Error('directory sort controls should only contain stars, newest, and active')
  }
  if ((await desktop.locator('.self-install-banner').count()) !== 1) {
    throw new Error('directory view is missing the self install banner')
  }
  if (!(await desktop.locator('.self-install-banner').textContent())?.includes('npx dsh1024 store')) {
    throw new Error('directory self install banner is missing the npx dsh1024 store command')
  }
  if ((await desktop.locator('.directory-section .package-row .split-install-main').count()) === 0) {
    throw new Error('directory rows are missing the split install button')
  }
  await assertLiveStats(desktop)
  await assertSeo(desktop, 'desktop catalog', '/plugins')
  await assertNoHorizontalOverflow(desktop, 'desktop catalog')
  if (await desktop.locator('.hero-heading h1 a[href="https://deepseek1024.com/"]').getAttribute('aria-label') !== 'DeepSeek Harness Plugin 1024Store') {
    throw new Error('catalog hero does not show the linked DeepSeek Harness Plugin 1024Store title')
  }
  if (!(await desktop.locator('.hero-heading > p:last-child').textContent())?.includes('收录插件均先经 DSH 插件规范检查与过滤')) {
    throw new Error('catalog hero does not keep the shared plugin screening description')
  }
  if (!/^\d+ (秒|分钟|小时|天)前更新$/.test((await desktop.locator('.hero-updated').textContent())?.trim() ?? '')) {
    throw new Error('catalog tally does not show a relative update time')
  }
  const heroAlignment = await desktop.evaluate(() => {
    const heading = document.querySelector('.hero-heading')?.getBoundingClientRect()
    const actions = document.querySelector('.hero-stage > .hero-actions')?.getBoundingClientRect()
    const hero = document.querySelector('.catalog-hero')?.getBoundingClientRect()
    const navigation = document.querySelector('.catalog-content > .catalog-navigation')?.getBoundingClientRect()
    return {
      actionsTop: actions?.top,
      headingTop: heading?.top,
      heroBottom: hero?.bottom,
      heroControlCount: document.querySelectorAll('.catalog-hero .catalog-toolbar, .catalog-hero .catalog-view-tabs').length,
      legacyToplineCount: document.querySelectorAll('.hero-topline').length,
      navigationTop: navigation?.top,
    }
  })
  if (
    heroAlignment.legacyToplineCount !== 0
    || heroAlignment.heroControlCount !== 0
    || heroAlignment.actionsTop === undefined
    || heroAlignment.headingTop === undefined
    || heroAlignment.heroBottom === undefined
    || heroAlignment.navigationTop === undefined
    || Math.abs(heroAlignment.actionsTop - heroAlignment.headingTop) > 1
    || heroAlignment.navigationTop < heroAlignment.heroBottom
  ) {
    throw new Error(`hero and catalog controls have incorrect structure: ${JSON.stringify(heroAlignment)}`)
  }
  await desktop.close()

  const rankings = await openPage({ width: 1440, height: 1000 }, '/rankings')
  await rankings.locator('.ranking-section').waitFor()
  if ((await rankings.locator('.directory-section').count()) !== 0) {
    throw new Error('desktop rankings unexpectedly renders the directory')
  }
  if ((await rankings.locator('.ranking-section .segmented-control button').count()) !== 4) {
    throw new Error('rankings should only expose the four GitHub activity modes')
  }
  if (await rankings.locator('.ranking-section .segmented-control button').first().getAttribute('aria-pressed') !== 'true') {
    throw new Error('rankings should default to the 24h growth mode')
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
  if ((await rankings.locator('.catalog-hero .hero-brand').count()) !== 0) {
    throw new Error('removed top-left banner title is still rendered')
  }
  if ((await rankings.locator('.site-header').count()) !== 0) {
    throw new Error('the removed standalone site header is still rendered')
  }
  if (await rankings.locator('.hero-heading h1 a[href="https://deepseek1024.com/"]').getAttribute('aria-label') !== 'DeepSeek Harness Plugin 1024Store') {
    throw new Error('ranking hero does not keep the shared store title')
  }
  if (!(await rankings.locator('.hero-heading > p:last-child').textContent())?.includes('收录插件均先经 DSH 插件规范检查与过滤')) {
    throw new Error('ranking hero does not keep the shared plugin screening description')
  }
  if ((await rankings.locator('.catalog-hero .hero-lockup-mark img[src="/deepseek1024.png"]').count()) !== 1) {
    throw new Error('hero poster mark is missing the store icon')
  }
  if ((await rankings.locator('footer, .reset-button').count()) !== 0) {
    throw new Error('removed footer or refresh control is still rendered')
  }
  if ((await rankings.locator('.self-install-banner').count()) !== 1) {
    throw new Error('rankings view is missing the self install banner')
  }
  if (!(await rankings.locator('.self-install-banner').textContent())?.includes('npx dsh1024 store')) {
    throw new Error('rankings self install banner is missing the npx dsh1024 store command')
  }
  await assertSeo(rankings, 'desktop rankings', '/')
  await rankings.locator('.ranking-section .segmented-control button').last().click()
  await rankings.locator('.ranking-section .package-row').first().waitFor()
  if ((await rankings.locator('.ranking-section .package-row').count()) !== 100) {
    throw new Error('GitHub activity rankings did not render the top 100 packages')
  }
  if ((await rankings.locator('.ranking-section .package-row .split-install-main').count()) === 0) {
    throw new Error('ranking rows are missing the split install button')
  }
  await rankings.locator('.ranking-section .package-row .split-install-toggle').first().click()
  await rankings.locator('.split-install-menu').waitFor()
  if ((await rankings.locator('.split-install-menu [role="menuitem"]').count()) !== 2) {
    throw new Error('split install menu does not expose exactly two command options')
  }
  // The first row may be the store's own catalog entry, whose menu shows the
  // dedicated `npx dsh1024 store` / `… add dsh1024` pair instead of the generic
  // owner/repository commands.
  const splitMenuText = await rankings.locator('.split-install-menu').textContent()
  if (!splitMenuText?.includes('npx dsh1024 ') || !splitMenuText.includes('npx @deepseek-ai/dsh plugin --profile web add')) {
    throw new Error('split install menu is missing the tracked or official install command')
  }
  await rankings.keyboard.press('Escape')
  if ((await rankings.locator('.split-install-menu').count()) !== 0) {
    throw new Error('split install menu did not close on Escape')
  }
  if ((await rankings.locator('a[href^="/plugins/"]').count()) === 0) {
    throw new Error('catalog cards do not use the canonical plural plugins path')
  }
  // Search filters client-side from the cached catalog; no network round trip.
  await rankings.locator('input[type="search"]').fill('crosstalk')
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

  const mobile = await openPage({ width: 390, height: 844 }, '/plugins', { touch: true })
  await mobile.locator('.directory-section .package-list').waitFor()
  await assertLiveStats(mobile)

  // Regression guards for instant filtering: the directory renders
  // incrementally instead of mounting every plugin at once, and switching
  // filters derives from the cached catalog without another network request.
  let catalogRequests = 0
  mobile.on('request', (request) => {
    if (request.url().includes('/api/v1/plugins')) catalogRequests += 1
  })
  const initialRows = await mobile.locator('.directory-section .package-row').count()
  if (initialRows !== 100) {
    throw new Error(`directory mounted ${initialRows} rows at once; expected the first 100 rows`)
  }
  await mobile.locator('.load-more-row button').waitFor()
  await mobile.locator('.load-more-row button').scrollIntoViewIfNeeded()
  await mobile.waitForTimeout(500)
  if ((await mobile.locator('.directory-section .package-row').count()) !== initialRows) {
    throw new Error('directory loaded more rows automatically before the button was clicked')
  }
  await mobile.locator('.load-more-row button').click()
  await mobile.waitForFunction(
    (before) => document.querySelectorAll('.directory-section .package-row').length > before,
    initialRows,
    { timeout: 5_000 },
  )
  await mobile.locator('.category-filter button').nth(2).click()
  await mobile.waitForFunction(
    () => document.querySelectorAll('.category-filter button')[2]?.classList.contains('selected'),
    undefined,
    { timeout: 5_000 },
  )
  if (catalogRequests > 0) {
    throw new Error('filter interactions refetched the catalog; expected client-side derivation')
  }
  await mobile.locator('.category-filter button').first().click()
  await mobile.waitForURL((url) => !url.searchParams.has('category'))
  await assertMobileEnvironment(mobile, 'mobile catalog')
  await assertNoHorizontalOverflow(mobile, 'mobile catalog')
  await assertMinTouchTargets(mobile, 'mobile catalog', [
    '.catalog-hero .github-link',
    '.catalog-hero .hero-submit',
    '.catalog-hero .hero-language button',
    '.catalog-view-tabs a',
    '.category-filter button',
    '.segmented-control button',
    '.package-row .split-install-main',
    '.package-row .split-install-toggle',
    '.package-row .row-link',
    '.load-more-row .button',
  ])
  await assertMinFontSize(mobile, 'mobile search input', 'input[type="search"]', 16)
  await assertMinFontSize(mobile, 'mobile package title', '.row-title', 14)
  await assertMinFontSize(mobile, 'mobile package description', '.row-identity p', 12)
  await assertMinFontSize(mobile, 'mobile package metrics', '.row-metrics > span', 11)
  await assertMinFontSize(mobile, 'mobile hero description', '.hero-heading > p:last-child', 14)
  await assertMinFontSize(mobile, 'mobile hero tally label', '.hero-tally-label', 11)
  await assertHorizontalTouchScroller(mobile, 'mobile category filters', '.category-filter')

  await mobile.locator('.category-filter button').nth(1).click()
  await mobile.waitForURL((url) => url.searchParams.has('category'))
  await mobile.locator('.category-filter button').first().click()
  await mobile.waitForURL((url) => !url.searchParams.has('category'))

  await mobile.locator('input[type="search"]').fill('crosstalk')
  await mobile.waitForURL((url) => url.searchParams.get('q') === 'crosstalk')
  await mobile.waitForFunction(
    () => document.querySelector('meta[name="robots"]')?.getAttribute('content') === 'noindex,follow',
    undefined,
    { timeout: 5_000 },
  )
  await assertSeo(mobile, 'filtered mobile catalog', '/plugins', 'noindex,follow')
  if ((await mobile.locator('.directory-section .package-row').count()) === 0) {
    throw new Error('search returned no package rows')
  }
  await mobile.locator('.directory-section .package-row .split-install-main').first().click()
  await mobile.locator('.directory-section .package-row .split-install-main[aria-label="已复制"]').waitFor()
  await mobile.locator('.directory-section .package-row .split-install-toggle').first().click()
  await mobile.locator('.split-install-menu').waitFor()
  if ((await mobile.locator('.split-install-menu [role="menuitem"]').count()) !== 2) {
    throw new Error('mobile split install menu does not expose exactly two command options')
  }
  await assertMinTouchTargets(mobile, 'mobile split install menu', ['.split-install-menu [role="menuitem"]'])
  await assertNoHorizontalOverflow(mobile, 'mobile catalog with the install menu open')
  await mobile.keyboard.press('Escape')
  if ((await mobile.locator('.split-install-menu').count()) !== 0) {
    throw new Error('mobile split install menu did not close on Escape')
  }
  await mobile.locator('.catalog-hero .language-switch button').last().click()
  await mobile.waitForFunction(() => document.documentElement.lang === 'en')
  await assertNoHorizontalOverflow(mobile, 'English mobile catalog')
  await mobile.locator('.catalog-hero .language-switch button').first().click()
  await mobile.waitForFunction(() => document.documentElement.lang === 'zh-CN')

  // The visual row is also the primary mobile navigation target. Exercise a
  // point in its padding, away from the title link and copy button, so this
  // fails if only those small controls are clickable.
  const firstMobileRow = mobile.locator('.directory-section .package-row').first()
  const firstMobileDetailPath = await firstMobileRow.locator('.row-link').getAttribute('href')
  if (!firstMobileDetailPath) throw new Error('mobile package row is missing its detail path')
  const detailPopupPromise = mobile.waitForEvent('popup')
  await firstMobileRow.click({ position: { x: 8, y: 8 } })
  const detailPopup = await detailPopupPromise
  await detailPopup.waitForLoadState('domcontentloaded')
  if (new URL(detailPopup.url()).pathname !== firstMobileDetailPath) {
    throw new Error(`mobile package row opened the wrong detail page: ${detailPopup.url()}`)
  }
  await detailPopup.close()
  await mobile.close()

  const mobileRankings = await openPage({ width: 390, height: 844 }, '/rankings', { touch: true })
  await waitForRankingList(mobileRankings)
  await assertMobileEnvironment(mobileRankings, 'mobile rankings')
  await assertNoHorizontalOverflow(mobileRankings, 'mobile rankings')
  await assertMinTouchTargets(mobileRankings, 'mobile rankings', [
    '.catalog-view-tabs a',
    '.segmented-control button',
    '.package-row .row-link',
  ])
  await assertHorizontalTouchScroller(
    mobileRankings,
    'mobile GitHub ranking modes',
    '.ranking-mode-group:last-child .segmented-control',
    // Four modes fit within 390px; the scroller only engages when they overflow.
    { requireOverflow: false },
  )
  await mobileRankings.locator('.ranking-section .segmented-control button').last().click()
  if (await mobileRankings.locator('.ranking-section .segmented-control button').last().getAttribute('aria-pressed') !== 'true') {
    throw new Error('mobile ranking controls could not select an offscreen mode')
  }
  await mobileRankings.close()

  const detail = await openPage({ width: 1440, height: 1000 }, '/plugins/openma-ai/deepseek-harness-tui')
  await detail.locator('.detail-header').waitFor()
  await detail.locator('.install-activity-section').waitFor()
  const detailInstallCommands = await detail.locator('.install-section .install-command code:visible').allTextContents()
  if (!detailInstallCommands.some((text) => text.includes('npx dsh1024 add '))) {
    throw new Error('detail page is missing the tracked dsh1024 install command')
  }
  if (!detailInstallCommands.some((text) => text.includes('npx @deepseek-ai/dsh plugin --profile web add github:'))) {
    throw new Error('detail page is missing the official CLI install command')
  }
  if (detailInstallCommands.some((text) => text.includes('@dsh-1024store/cli'))) {
    throw new Error('detail page still renders the legacy @dsh-1024store/cli command')
  }
  await assertSeo(detail, 'desktop detail', '/plugins/openma-ai/deepseek-harness-tui')
  await assertNoHorizontalOverflow(detail, 'desktop detail')
  await detail.locator('.detail-brand').click()
  await detail.waitForURL((url) => url.pathname === '/')
  await detail.locator('.ranking-section').waitFor()
  await detail.close()

  // The store's own catalog entry must show the dedicated dsh1024 commands,
  // never a generic "install the whole monorepo" command.
  const selfDetail = await openPage({ width: 1440, height: 1000 }, '/plugins/imsai-sh/awesome-deepseek-harness-plugins')
  await selfDetail.locator('.detail-header').waitFor()
  const selfInstallCommands = await selfDetail.locator('.install-section .install-command code:visible').allTextContents()
  if (!selfInstallCommands.some((text) => text.includes('npx dsh1024 store'))) {
    throw new Error('self entry detail page is missing the npx dsh1024 store command')
  }
  if (selfInstallCommands.some((text) => text.includes('add imsai-sh/awesome-deepseek-harness-plugins') || text.includes('add github:imsai-sh/awesome-deepseek-harness-plugins'))) {
    throw new Error('self entry detail page renders a generic monorepo install command')
  }
  await selfDetail.close()

  const scoped = await openPage({ width: 390, height: 844 }, '/plugins/zhaoolee/notes', { touch: true })
  await scoped.locator('.detail-header').waitFor()
  await assertMobileEnvironment(scoped, 'mobile package detail')
  await assertNoHorizontalOverflow(scoped, 'scoped package detail')
  await assertMinTouchTargets(scoped, 'mobile package detail', [
    '.detail-brand',
    '.detail-utility .language-switch button',
    '.back-link',
    '.detail-actions .button',
    '.install-options .icon-button',
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
  await scoped.waitForURL((url) => url.pathname === '/')
  await scoped.locator('.ranking-section').waitFor()
  await scoped.close()

  const compactMobile = await openPage({ width: 320, height: 568 }, '/rankings', { touch: true })
  await waitForRankingList(compactMobile)
  await assertNoHorizontalOverflow(compactMobile, 'compact mobile rankings')
  if (await compactMobile.locator('.catalog-hero .hero-language').isVisible()) {
    throw new Error('compact mobile header did not hide the secondary language control')
  }
  await assertMinTouchTargets(compactMobile, 'compact mobile header', [
    '.catalog-hero .github-link',
    '.catalog-hero .hero-submit',
    '.catalog-view-tabs a',
    '.package-row .split-install-main',
    '.package-row .split-install-toggle',
    '.package-row .row-link',
  ])
  await compactMobile.locator('.ranking-section .package-row .split-install-toggle').first().click()
  await compactMobile.locator('.split-install-menu').waitFor()
  if ((await compactMobile.locator('.split-install-menu [role="menuitem"]').count()) !== 2) {
    throw new Error('compact split install menu does not expose exactly two command options')
  }
  await assertMinTouchTargets(compactMobile, 'compact split install menu', ['.split-install-menu [role="menuitem"]'])
  await assertNoHorizontalOverflow(compactMobile, 'compact mobile rankings with the install menu open')
  await compactMobile.keyboard.press('Escape')
  if ((await compactMobile.locator('.split-install-menu').count()) !== 0) {
    throw new Error('compact split install menu did not close on Escape')
  }
  await compactMobile.close()

  if (errors.length > 0) throw new Error(`browser errors:\n${errors.join('\n')}`)
  console.log('Visual smoke check passed: desktop, touch-enabled 390px mobile, compact 320px mobile, search, split install menus, self install banner, copy actions, local scrollers, and package details.')
} finally {
  await desktopContext.close()
  await mobileContext.close()
  await browser.close()
}
