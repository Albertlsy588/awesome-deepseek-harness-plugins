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

async function assertVisibleSubdirectorySiblingsHaveDistinctTitles(page, label) {
  const duplicateTitles = await page.locator('.package-row').evaluateAll((rows) => {
    const siblings = new Map()
    for (const row of rows) {
      const link = row.querySelector('.row-link')
      const href = link?.getAttribute('href') ?? ''
      const segments = href.split('/').filter(Boolean)
      if (segments.length <= 3) continue
      const repositoryPath = segments.slice(0, 3).join('/')
      const titles = siblings.get(repositoryPath) ?? []
      titles.push(link?.textContent?.trim() ?? '')
      siblings.set(repositoryPath, titles)
    }
    return [...siblings.entries()]
      .filter(([, titles]) => titles.length > 1 && new Set(titles).size !== titles.length)
  })
  if (duplicateTitles.length > 0) {
    throw new Error(`${label} repeats titles for subdirectory siblings: ${JSON.stringify(duplicateTitles)}`)
  }
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
        // A stretched link wraps short text but takes its hit area from an
        // absolutely positioned ::after covering the whole card, so measuring
        // the anchor's own box would understate the real touch target.
        const overlay = getComputedStyle(node, '::after')
        const stretched = overlay.position === 'absolute' &&
          overlay.inset === '0px' &&
          node.offsetParent !== null
        const box = (stretched ? node.offsetParent : node).getBoundingClientRect()
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

// Install commands must stay fully readable: they wrap onto a second line
// instead of hiding their tail behind an inner horizontal scrollbar.
async function assertInstallCommandsReadable(page, label, scope) {
  const clipped = await page.locator(`${scope} .install-command code`).evaluateAll((nodes) => nodes
    .filter((node) => node.scrollWidth > node.clientWidth + 1)
    .map((node) => node.textContent ?? ''))
  if (clipped.length > 0) {
    throw new Error(`${label} clips its install commands: ${JSON.stringify(clipped)}`)
  }
}

// The hero labels sit in one shared column, so all three command boxes have to
// start and end on the same pixel regardless of label width or language.
async function assertInstallCommandsAligned(page, label) {
  const edges = await page.locator('.self-install-banner .install-command').evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect()
      return { left: Math.round(box.left), right: Math.round(box.right) }
    }))
  if (edges.length !== 2) {
    throw new Error(`${label} should render two install commands, saw ${edges.length}`)
  }
  const lefts = new Set(edges.map((edge) => edge.left))
  const rights = new Set(edges.map((edge) => edge.right))
  if (lefts.size !== 1 || rights.size !== 1) {
    throw new Error(`${label} install commands are misaligned: ${JSON.stringify(edges)}`)
  }
}

// The menu is portaled to document.body, so nothing in the list should be able
// to paint over it. Hit-test its four corners and confirm the topmost element
// at each point still belongs to the menu, and that it fits inside the viewport.
async function assertMenuOnTop(page, label) {
  const result = await page.locator('.split-install-menu').evaluate((menu) => {
    const box = menu.getBoundingClientRect()
    // Stay clear of the 9px rounded corners: a tighter inset lands on the
    // antialiased arc and reports whatever sits behind the menu.
    const inset = 10
    const corners = [
      ['top-left', box.left + inset, box.top + inset],
      ['top-right', box.right - inset, box.top + inset],
      ['bottom-left', box.left + inset, box.bottom - inset],
      ['bottom-right', box.right - inset, box.bottom - inset],
      ['center', (box.left + box.right) / 2, (box.top + box.bottom) / 2],
    ]
    return {
      box: {
        bottom: Math.round(box.bottom),
        left: Math.round(box.left),
        right: Math.round(box.right),
        top: Math.round(box.top),
      },
      covered: corners
        .filter(([, x, y]) => {
          const hit = document.elementFromPoint(x, y)
          return !(hit && (menu === hit || menu.contains(hit)))
        })
        .map(([corner, x, y]) => {
          const hit = document.elementFromPoint(x, y)
          return `${corner}: ${hit ? `${hit.tagName.toLowerCase()}.${hit.className}` : 'null'}`
        }),
      viewport: { height: window.innerHeight, width: window.innerWidth },
    }
  })
  if (result.covered.length > 0) {
    throw new Error(`${label} is covered by other elements at ${JSON.stringify(result.covered)}`)
  }
  const { box, viewport } = result
  if (box.left < 0 || box.top < 0 || box.right > viewport.width || box.bottom > viewport.height) {
    throw new Error(`${label} does not fit inside the viewport: ${JSON.stringify({ box, viewport })}`)
  }
}

async function assertSeo(page, label, canonicalPath, robots = 'index,follow') {
  const result = await page.evaluate(() => ({
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    description: document.querySelector('meta[name="description"]')?.getAttribute('content'),
    h1Count: document.querySelectorAll('h1').length,
    h2Count: document.querySelectorAll('h2').length,
    shellLeftBehind: document.querySelectorAll('[data-seo-shell]').length,
    shellGuarded: (() => {
      const probe = document.createElement('div')
      probe.className = 'seo-shell'
      document.body.append(probe)
      const hidden = getComputedStyle(probe).display === 'none'
      probe.remove()
      return document.documentElement.classList.contains('has-js') && hidden
    })(),
    robots: document.querySelector('meta[name="robots"]')?.getAttribute('content'),
    title: document.title,
  }))
  // A noindexed permutation ships no canonical at all: pointing it at the
  // unfiltered page would pair a "do not index" with a "index that one instead".
  if (canonicalPath === null) {
    if (result.canonical !== undefined) {
      throw new Error(`${label} should not declare a canonical URL: ${result.canonical}`)
    }
  } else if (result.canonical !== `https://deepseek1024.com${canonicalPath}`) {
    throw new Error(`${label} has an incorrect canonical URL: ${result.canonical}`)
  }
  if (!result.description || result.description.length < 50) {
    throw new Error(`${label} is missing a useful meta description`)
  }
  if (result.h1Count !== 1) throw new Error(`${label} should render exactly one H1`)
  // The Worker injects a crawlable shell into #root for clients that cannot run
  // JavaScript. React replaces it on mount, and the inline head guard must have
  // kept it from ever painting in the meantime.
  if (result.shellLeftBehind !== 0) {
    throw new Error(`${label} still shows the pre-hydration SEO shell after mount`)
  }
  if (!result.shellGuarded) {
    throw new Error(`${label} would paint the SEO shell before React mounts`)
  }
  if (result.h2Count < 1) throw new Error(`${label} should name its content with at least one H2`)
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

  // 站点外框：四个板块共用一条侧栏，切换是客户端路由（不整页跳转），
  // 且社区板块必须真的被渲染出来 —— 它和目录站共用一份 SPA fallback，
  // 路由分流一旦错了会静默地渲染成另一个板块。
  const shell = await openPage({ width: 1440, height: 900 }, '/community')
  await shell.locator('.page-head').waitFor()
  const sections = await shell.locator('.shell-sidebar .sidebar-sections .nav-link').evaluateAll(
    (links) => links.map((link) => link.getAttribute('href')),
  )
  if (JSON.stringify(sections) !== JSON.stringify(['/', '/plugins', '/community', '/docs/api'])) {
    throw new Error(`sidebar sections drifted: ${JSON.stringify(sections)}`)
  }
  // 「提交插件」是动作，另起一组，不算板块。
  if ((await shell.locator('.shell-sidebar .sidebar-secondary .nav-link').count()) !== 1) {
    throw new Error('the sidebar should offer exactly one submit action below the sections')
  }
  // 语言和账号沉在栏底，未登录也看得见语言 —— 本站主要流量是未登录访客。
  const sidebarFoot = await shell.evaluate(() => ({
    language: document.querySelectorAll('.sidebar-foot .language-switch').length,
    account: document.querySelectorAll('.sidebar-foot .sidebar-account, .sidebar-foot .sidebar-signin, .sidebar-foot .sidebar-account-placeholder').length,
  }))
  if (sidebarFoot.language !== 1 || sidebarFoot.account !== 1) {
    throw new Error(`sidebar foot is wrong: ${JSON.stringify(sidebarFoot)}`)
  }
  const activeHref = await shell.locator('.shell-sidebar .nav-link.active').getAttribute('href')
  if (activeHref !== '/community') {
    throw new Error(`sidebar does not mark the open section: ${activeHref}`)
  }
  // 社区内部链接必须带板块前缀，否则会落到目录站的路由上。
  const strayLinks = await shell.locator('.post a[href^="/"]').evaluateAll(
    (links) => links.map((link) => link.getAttribute('href')).filter((href) => !href.startsWith('/community/')),
  )
  if (strayLinks.length > 0) {
    throw new Error(`community links missing the section prefix: ${JSON.stringify(strayLinks)}`)
  }
  // 切到另一个板块：不整页跳转，侧栏跟着变。
  await shell.locator('.shell-sidebar .nav-link[href="/plugins"]').click()
  await shell.waitForURL('**/plugins')
  // 页头是四个板块共用的骨架；hero 只在排行榜页，等它会永远超时。
  await shell.locator('.page-head').waitFor()
  if ((await shell.locator('.site-hero').count()) !== 0) {
    throw new Error('the catalog section should not carry the rankings hero')
  }
  await assertNoHorizontalOverflow(shell, 'desktop shell after section switch')
  await shell.close()

  const mobileShell = await openPage({ width: 390, height: 844 }, '/community', { touch: true })
  await mobileShell.locator('.page-head').waitFor()
  await assertNoHorizontalOverflow(mobileShell, 'mobile community')
  await assertMinTouchTargets(mobileShell, 'mobile community actions', [
    '.shell-bar-toggle', '.tab', '.post-action',
  ])
  // 窄屏侧栏收成一个展开菜单，展开后仍不能撑破页面。
  await mobileShell.locator('.shell-bar-toggle').tap()
  await mobileShell.locator('.shell-bar-menu .nav-link').first().waitFor()
  await assertMinTouchTargets(mobileShell, 'mobile section menu', ['.shell-bar-menu .nav-link'])
  await assertNoHorizontalOverflow(mobileShell, 'mobile community with the menu open')
  await mobileShell.close()

  const compactCommunity = await openPage({ width: 320, height: 568 }, '/community', { touch: true })
  await compactCommunity.locator('.page-head').waitFor()
  await assertNoHorizontalOverflow(compactCommunity, 'compact community')
  await compactCommunity.close()

  const desktop = await openPage({ width: 1440, height: 1000 }, '/plugins')
  await desktop.locator('.directory-section .package-list').waitFor()
  if ((await desktop.locator('.ranking-section').count()) !== 0) {
    throw new Error('desktop catalog unexpectedly renders rankings')
  }
  if ((await desktop.locator('.directory-section .sort-segments button').count()) !== 3) {
    throw new Error('directory sort controls should only contain stars, newest, and active')
  }
  // 包装 CLI 的安装横幅是落地页的 CTA，跟着 hero 只留在排行榜页。
  // 目录页每一行本来就各带自己的安装按钮。
  if ((await desktop.locator('.self-install-banner').count()) !== 0) {
    throw new Error('the catalog section should not repeat the wrapper-CLI install banner')
  }
  if ((await desktop.locator('.directory-section .package-row .split-install-main').count()) === 0) {
    throw new Error('directory rows are missing the split install button')
  }
  await assertLiveStats(desktop)
  await assertSeo(desktop, 'desktop catalog', '/plugins')
  await assertNoHorizontalOverflow(desktop, 'desktop catalog')
  await assertVisibleSubdirectorySiblingsHaveDistinctTitles(desktop, 'desktop catalog')
  // 插件目录页不再有 hero：/ 是搜索流量的落地页需要自我介绍，
  // /plugins 是干活的页面，进来的人已经知道这是哪儿了。
  if ((await desktop.locator('.site-hero').count()) !== 0) {
    throw new Error('the catalog page should not render the site hero')
  }
  if ((await desktop.locator('.page-head h1').count()) !== 1) {
    throw new Error('the catalog page should render exactly one page heading')
  }
  if (!/^\d+ (秒|分钟|小时|天)前更新$/.test((await desktop.locator('.page-head-updated').textContent())?.trim() ?? '')) {
    throw new Error('the catalog page head does not show a relative update time')
  }
  // 侧栏是唯一的站点导航；页内不该再有一份板块切换。
  const duplicateSectionNav = await desktop.evaluate(() => ({
    viewTabs: document.querySelectorAll('.catalog-view-tabs').length,
    utility: document.querySelectorAll('.detail-utility').length,
    sidebarSections: document.querySelectorAll('.shell-sidebar .sidebar-sections .nav-link').length,
    sidebarSecondary: document.querySelectorAll('.shell-sidebar .sidebar-secondary .nav-link').length,
  }))
  if (
    duplicateSectionNav.viewTabs !== 0
    || duplicateSectionNav.utility !== 0
    || duplicateSectionNav.sidebarSections !== 4
    || duplicateSectionNav.sidebarSecondary !== 1
  ) {
    throw new Error(`section navigation is duplicated or incomplete: ${JSON.stringify(duplicateSectionNav)}`)
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
  if (
    (await rankings.locator('.ranking-section > .section-title').count()) !== 0
    || await rankings.locator('#rankings-heading').getAttribute('class') !== 'visually-hidden'
    || (await rankings.locator('.ranking-mode-group > span').count()) !== 0
  ) {
    throw new Error('rankings still show the redundant list heading or GitHub activity label')
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
  // 横幅只在排行榜页出现，鲸鱼是它的主角。原来那排动作链接
  // （免费API / 作者主页 / 插件市场开源 / 提交插件）已进侧栏，
  // 语言切换也是；页内不该再有它们的副本。
  const heroBanner = await rankings.evaluate(() => {
    const hero = document.querySelector('.site-hero')
    const whale = document.querySelector('.site-hero-whale')
    return {
      present: Boolean(hero),
      height: hero ? Math.round(hero.getBoundingClientRect().height) : 0,
      whaleSrc: whale?.getAttribute('src') ?? null,
      figures: document.querySelectorAll('.site-hero-figure').length,
      strayActions: document.querySelectorAll('.site-hero .hero-actions, .site-hero .language-switch').length,
    }
  })
  if (!heroBanner.present || heroBanner.whaleSrc !== '/deepseek1024.png') {
    throw new Error(`rankings hero banner is missing its whale: ${JSON.stringify(heroBanner)}`)
  }
  if (heroBanner.figures !== 2 || heroBanner.strayActions !== 0) {
    throw new Error(`rankings hero banner has the wrong contents: ${JSON.stringify(heroBanner)}`)
  }
  // 压缩是这次改版的重点：原来约 500px 占满首屏，现在必须让位给榜单。
  if (heroBanner.height > 260) {
    throw new Error(`rankings hero banner grew back to ${heroBanner.height}px; it must stay compact`)
  }
  // 榜单第一行要在首屏之内。
  const firstRowTop = await rankings.locator('.package-row').first().evaluate(
    (node) => Math.round(node.getBoundingClientRect().top))
  if (firstRowTop > 1000) {
    throw new Error(`the first ranking row starts at ${firstRowTop}px, below the fold`)
  }

  if ((await rankings.locator('footer, .reset-button').count()) !== 0) {
    throw new Error('removed footer or refresh control is still rendered')
  }
  if ((await rankings.locator('.self-install-banner').count()) !== 1) {
    throw new Error('rankings hero is missing the self install banner')
  }
  const rankingsBannerText = await rankings.locator('.self-install-banner').textContent()
  for (const command of [
    'npm install -g dsh1024 && dsh1024 plugin --profile web add dsh1024',
    'dsh plugin --profile web add dsh1024',
  ]) {
    if (!rankingsBannerText?.includes(command)) {
      throw new Error(`rankings self install banner is missing the command: ${command}`)
    }
  }
  await assertInstallCommandsAligned(rankings, 'desktop rankings hero')
  await assertInstallCommandsReadable(rankings, 'rankings install commands', '.self-install-banner')
  await assertSeo(rankings, 'desktop rankings', '/')
  await rankings.locator('.ranking-section .segmented-control button').last().click()
  await rankings.locator('.ranking-section .package-row').first().waitFor()
  if ((await rankings.locator('.ranking-section .package-row').count()) !== 100) {
    throw new Error('GitHub activity rankings did not render the top 100 packages')
  }
  if ((await rankings.locator('.ranking-section .package-row .split-install-main').count()) === 0) {
    throw new Error('ranking rows are missing the split install button')
  }
  // A middle row is the interesting case: rows below it used to paint over the
  // menu back when it was anchored inside the row's stacking context.
  await rankings.locator('.ranking-section .package-row .split-install-toggle').nth(4).click()
  await rankings.locator('.split-install-menu').waitFor()
  await assertMenuOnTop(rankings, 'desktop rankings split install menu')
  await assertNoHorizontalOverflow(rankings, 'desktop rankings with the install menu open')
  if ((await rankings.locator('.split-install-menu [role="menuitem"]').count()) !== 2) {
    throw new Error('split install menu does not expose exactly two command options')
  }
  // The first row may be the store's own catalog entry, whose menu shows the
  // dedicated `… add dsh1024` pair instead of the generic
  // owner/repository commands.
  const splitMenuText = await rankings.locator('.split-install-menu').textContent()
  // Two fixed options: the tracked wrapper and the official CLI. The row may be
  // the store's own entry, whose commands target dsh1024.
  for (const command of ['dsh1024 plugin --profile web add', 'dsh plugin --profile web add']) {
    if (!splitMenuText?.includes(command)) {
      throw new Error(`split install menu is missing an install command: ${command}`)
    }
  }
  // Commands must be fully readable: wide menu, wrapping instead of clipping.
  const clippedMenuCommands = await rankings
    .locator('.split-install-menu code')
    .evaluateAll((nodes) => nodes
      .filter((node) => node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1)
      .map((node) => node.textContent ?? ''))
  if (clippedMenuCommands.length > 0) {
    throw new Error(`split install menu clips its commands: ${JSON.stringify(clippedMenuCommands)}`)
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
  await assertVisibleSubdirectorySiblingsHaveDistinctTitles(mobile, 'mobile catalog')
  await assertMinTouchTargets(mobile, 'mobile catalog', [
    '.shell-bar-toggle',
    '.category-filter button',
    '.segmented-control button',
    '.self-install-banner .install-command .icon-button',
    '.package-row .split-install-main',
    '.package-row .split-install-toggle',
    '.package-row .row-link',
    '.load-more-row .button',
  ])
  await assertMinFontSize(mobile, 'mobile search input', 'input[type="search"]', 16)
  await assertMinFontSize(mobile, 'mobile package title', '.row-title', 14)
  await assertMinFontSize(mobile, 'mobile package description', '.row-identity p', 12)
  await assertMinFontSize(mobile, 'mobile package metrics', '.row-metrics > span', 11)
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
  await assertSeo(mobile, 'filtered mobile catalog', null, 'noindex,follow')
  // The URL and the robots meta flip a render before the filtered list does, so
  // counting rows immediately races the re-render rather than testing the search.
  await mobile.locator('.directory-section .package-row').first().waitFor({ timeout: 10_000 })
    .catch(() => { throw new Error('search returned no package rows') })
  await mobile.locator('.directory-section .package-row .split-install-main').first().click()
  await mobile.locator('.directory-section .package-row .split-install-main[aria-label="已复制"]').waitFor()
  // The filtered list is short, so this is the first row; the portal assertion
  // below still proves nothing paints over the menu.
  await mobile.locator('.directory-section .package-row .split-install-toggle').first().click()
  await mobile.locator('.split-install-menu').waitFor()
  await assertMenuOnTop(mobile, 'mobile split install menu')
  if ((await mobile.locator('.split-install-menu [role="menuitem"]').count()) !== 2) {
    throw new Error('mobile split install menu does not expose exactly two command options')
  }
  await assertMinTouchTargets(mobile, 'mobile split install menu', ['.split-install-menu [role="menuitem"]'])
  await assertNoHorizontalOverflow(mobile, 'mobile catalog with the install menu open')
  await mobile.keyboard.press('Escape')
  if ((await mobile.locator('.split-install-menu').count()) !== 0) {
    throw new Error('mobile split install menu did not close on Escape')
  }
  // 侧栏在窄屏是隐藏的，语言切换随站点导航一起收进顶条菜单里，
  // 所以要先展开菜单才够得着 —— 手机上没有别的入口。
  await mobile.locator('.shell-bar-toggle').click()
  await mobile.locator('.shell-bar-menu .language-switch').waitFor()
  await mobile.locator('.shell-bar-menu .language-switch button').last().click()
  await mobile.waitForFunction(() => document.documentElement.lang === 'en')
  await assertNoHorizontalOverflow(mobile, 'English mobile catalog')
  await mobile.locator('.shell-bar-menu .language-switch button').first().click()
  await mobile.waitForFunction(() => document.documentElement.lang === 'zh-CN')
  await mobile.locator('.shell-bar-toggle').click()

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
  await assertInstallCommandsReadable(mobileRankings, 'mobile rankings install commands', '.self-install-banner')
  await assertMinFontSize(mobileRankings, 'mobile hero description', '.site-hero-desc', 13)
  await assertMinFontSize(mobileRankings, 'mobile hero figure label', '.site-hero-figure dt', 11)
  await assertNoHorizontalOverflow(mobileRankings, 'mobile rankings')
  await assertMinTouchTargets(mobileRankings, 'mobile rankings', [
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

  const apiDocs = await openPage({ width: 1440, height: 900 }, '/docs/api')
  await apiDocs.locator('.api-docs-contact').waitFor()
  if ((await apiDocs.locator('.api-docs-contact-link[href="https://www.imsai.cc/"][target="_blank"]').count()) !== 1) {
    throw new Error('API docs author contact does not link to imsai.cc in a new tab')
  }
  // 正文和页内目录现在分列两栏，联系区块是正文列的第一个块。
  if ((await apiDocs.locator('.api-docs-main > :first-child.api-docs-contact').count()) !== 1) {
    throw new Error('API docs author contact is not the first block in the content column')
  }
  // 目录必须覆盖每一个大节，否则读者会漏掉没被列出的那一节。
  const toc = await apiDocs.evaluate(() => ({
    links: [...document.querySelectorAll('.api-docs-toc a')].map((a) => a.getAttribute('href')),
    sections: [...document.querySelectorAll('.api-docs-section[id]')].map((s) => `#${s.id}`),
  }))
  if (JSON.stringify(toc.links) !== JSON.stringify(toc.sections)) {
    throw new Error(`the on-this-page list does not match the sections: ${JSON.stringify(toc)}`)
  }
  await assertSeo(apiDocs, 'desktop API docs', '/docs/api')
  await assertNoHorizontalOverflow(apiDocs, 'desktop API docs')
  await apiDocs.close()

  const mobileApiDocs = await openPage({ width: 390, height: 844 }, '/docs/api', { touch: true })
  await mobileApiDocs.locator('.api-docs-contact').waitFor()
  await assertMobileEnvironment(mobileApiDocs, 'mobile API docs')
  await assertNoHorizontalOverflow(mobileApiDocs, 'mobile API docs')
  await assertMinTouchTargets(mobileApiDocs, 'mobile API docs', [
    '.detail-brand',
    '.detail-utility .language-switch button',
    '.api-docs-key-button',
    '.api-docs-contact-link',
  ])
  await assertMinFontSize(mobileApiDocs, 'mobile API contact copy', '.api-docs-contact p', 13)
  await mobileApiDocs.close()

  const compactApiDocs = await openPage({ width: 320, height: 568 }, '/docs/api', { touch: true })
  await compactApiDocs.locator('.api-docs-contact').waitFor()
  await assertNoHorizontalOverflow(compactApiDocs, 'compact mobile API docs')
  await compactApiDocs.close()

  const detail = await openPage({ width: 1440, height: 1000 }, '/plugins/openma-ai/deepseek-harness-tui')
  await detail.locator('.detail-header').waitFor()
  await detail.locator('.install-activity-section').waitFor()
  const detailInstallCommands = await detail.locator('.install-section .install-command code:visible').allTextContents()
  if (!detailInstallCommands.some((text) => text.trim().startsWith('dsh plugin --profile web add github:'))) {
    throw new Error('detail page is missing the bare official CLI install command')
  }
  if (!detailInstallCommands.some((text) => text.trim().startsWith('dsh1024 plugin --profile web add github:'))) {
    throw new Error('detail page is missing the tracked dsh1024 install command')
  }
  if (detailInstallCommands.some((text) => text.includes('@dsh-1024store/cli'))) {
    throw new Error('detail page still renders the legacy @dsh-1024store/cli command')
  }
  // main ships the verification badges without any assertion; pin their shape
  // and the three states' copy so a wording change cannot silently drop them.
  const methodCount = await detail.locator('.install-section .install-method').count()
  if (methodCount > 0) {
    const badges = await detail.locator('.install-section .install-method .install-badge').allTextContents()
    if (badges.length === 0) throw new Error('install methods render without a verification badge')
    const known = ['已验证', '未验证', '检查中', '需授权构建']
    const unknownBadge = badges.find((text) => !known.includes(text.trim()))
    if (unknownBadge !== undefined) {
      throw new Error(`unexpected install verification badge: ${JSON.stringify(unknownBadge)}`)
    }
    // Every method carries both ways to run it, not just the official one.
    for (const selector of ['.install-option-recommended', '.install-option-official']) {
      const rows = await detail.locator(`.install-section .install-method ${selector}`).count()
      if (rows !== methodCount) {
        throw new Error(`each install method needs one ${selector}; saw ${rows} for ${methodCount} methods`)
      }
    }
  }
  await assertInstallCommandsReadable(detail, 'desktop detail', '.install-options')
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
  if (!selfInstallCommands.some((text) => text.includes('npm install -g dsh1024 && dsh1024 plugin --profile web add dsh1024'))) {
    throw new Error('self entry detail page is missing the global dsh1024 store install command')
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
  await assertInstallCommandsReadable(scoped, 'mobile package detail', '.install-options')
  await scoped.locator('.install-command-prominent .icon-button').click()
  await scoped.locator('.install-command-prominent .icon-button[aria-label="已复制"]').waitFor()
  await scoped.locator('.detail-brand').click()
  await scoped.waitForURL((url) => url.pathname === '/')
  await scoped.locator('.ranking-section').waitFor()
  await scoped.close()

  const compactMobile = await openPage({ width: 320, height: 568 }, '/rankings', { touch: true })
  await waitForRankingList(compactMobile)
  await assertNoHorizontalOverflow(compactMobile, 'compact mobile rankings')
  // 窄屏下站点导航折进顶条菜单；语言和账号跟着一起，页面里不该有副本。
  const compactChrome = await compactMobile.evaluate(() => ({
    inlineLanguage: document.querySelectorAll('.page .language-switch, .site-hero .language-switch').length,
    sidebarVisible: Boolean(document.querySelector('.shell-sidebar')?.getClientRects().length),
    barToggle: Boolean(document.querySelector('.shell-bar-toggle')?.getClientRects().length),
  }))
  if (compactChrome.inlineLanguage !== 0 || compactChrome.sidebarVisible || !compactChrome.barToggle) {
    throw new Error(`compact chrome is wrong: ${JSON.stringify(compactChrome)}`)
  }
  await compactMobile.locator('.ranking-section .package-row .split-install-toggle').nth(3).click()
  await compactMobile.locator('.split-install-menu').waitFor()
  await assertMenuOnTop(compactMobile, 'compact split install menu')
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

  // 看板娘（桌宠）回归：固定在视口内不越界、触屏按钮 ≥44px、
  // 投喂 → 气泡、玩耍 → 气泡。鲸鱼娘常驻（无隐藏入口）。
  // 看板娘带持续 3D 摆动动画，Playwright 的稳定检查会一直等，交互统一用 force。
  const pet = await openPage({ width: 390, height: 844 }, '/rankings', { touch: true })
  await waitForRankingList(pet)
  await pet.locator('.kanban-girl').waitFor()
  const petBounds = await pet.evaluate(() => {
    const rect = document.querySelector('.kanban-girl')?.getBoundingClientRect()
    return rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } : null
  })
  if (
    !petBounds
    || petBounds.left < 0
    || petBounds.top < 0
    || petBounds.right > 390
    || petBounds.bottom > 844
  ) {
    throw new Error(`mobile kanban girl leaves the viewport: ${JSON.stringify(petBounds)}`)
  }
  await pet.locator('.kanban-girl').tap({ force: true })
  await pet.locator('.kanban-girl-menu .kanban-girl-action').first().waitFor()
  await assertMinTouchTargets(pet, 'mobile kanban girl actions', [
    '.kanban-girl-menu .kanban-girl-action',
  ])
  await pet.locator('.kanban-girl-menu .kanban-girl-action').first().tap({ force: true })
  await pet.locator('.kanban-girl-bubble').waitFor()
  await pet.locator('.kanban-girl-menu .kanban-girl-action').nth(1).tap({ force: true })
  await pet.locator('.kanban-girl-bubble').waitFor()
  await pet.close()

  if (errors.length > 0) throw new Error(`browser errors:\n${errors.join('\n')}`)
  console.log('Visual smoke check passed: sidebar shell, community section, desktop, touch-enabled 390px mobile, compact 320px mobile, search, split install menus, self install banner, copy actions, local scrollers, and package details.')
} finally {
  await desktopContext.close()
  await mobileContext.close()
  await browser.close()
}
