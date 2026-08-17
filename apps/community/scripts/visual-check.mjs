/**
 * Responsive regression check for the community, run against a dev server.
 *
 *   npm run dev --workspace @dsh-1024store/community   # in one terminal
 *   npm run test:visual --workspace @dsh-1024store/community
 *
 * The assertions are the invariants the repository's responsive rules name:
 * the document never scrolls horizontally, repeated controls stay reachable by
 * thumb, inputs do not trigger iOS zoom, and nothing is hidden behind the
 * sticky header. Screenshots are a by-product; the failures are what matter.
 */
import { chromium } from 'playwright'

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:5642'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const desktop = await browser.newContext({ locale: 'zh-CN' })
const touch = await browser.newContext({
  locale: 'zh-CN',
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: true,
})
const failures = []

async function open(viewport, path, { mobile = false } = {}) {
  const page = await (mobile ? touch : desktop).newPage()
  await page.setViewportSize(viewport)
  page.on('pageerror', (error) => failures.push(`${path}: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
      failures.push(`${path}: ${message.text()}`)
    }
  })
  page.on('response', (response) => {
    // Avatars come from GitHub and a seeded login may not exist there; that is
    // not a layout failure.
    if (response.status() >= 400 && new URL(response.url()).origin === new URL(baseUrl).origin) {
      failures.push(`HTTP ${response.status()} ${response.url()}`)
    }
  })
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' })
  return page
}

async function assertNoHorizontalOverflow(page, label) {
  const overflowing = await page.evaluate(() => {
    const root = document.documentElement
    if (root.scrollWidth <= root.clientWidth + 1) return null
    // Name the widest offender rather than just reporting that something is.
    return [...document.querySelectorAll('body *')]
      .map((element) => ({ tag: element.tagName, cls: element.className, right: element.getBoundingClientRect().right }))
      .filter((entry) => entry.right > root.clientWidth + 1)
      .sort((left, right) => right.right - left.right)[0] ?? { tag: '?', cls: '?', right: root.scrollWidth }
  })
  if (overflowing) {
    failures.push(`${label} scrolls horizontally; widest is <${overflowing.tag} class="${overflowing.cls}"> at ${overflowing.right}px`)
  }
}

async function assertTouchTargets(page, label) {
  const small = await page.evaluate(() => {
    const selectors = '.post-action, .tab, .button-primary, .button-secondary, .nav-link, .language-switch button'
    return [...document.querySelectorAll(selectors)]
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => {
        const box = element.getBoundingClientRect()
        const name = element.className || element.tagName.toLowerCase()
        return { name, text: element.textContent.trim().slice(0, 12), width: Math.round(box.width), height: Math.round(box.height) }
      })
      .filter((entry) => entry.height < 44 || entry.width < 44)
  })
  for (const entry of small) {
    failures.push(`${label}: "${entry.text}" (${entry.name}) is ${entry.width}x${entry.height}, below the 44px touch target`)
  }
}

async function assertNoIosZoomOnFocus(page, label) {
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('textarea, input')]
      .filter((element) => Number.parseFloat(getComputedStyle(element).fontSize) < 16)
      .map((element) => element.tagName))
  for (const tag of small) {
    failures.push(`${label}: <${tag}> uses a font below 16px, so iOS zooms the page on focus`)
  }
}

async function assertNothingUnderTheHeader(page, label) {
  const hidden = await page.evaluate(() => {
    const header = document.querySelector('.shell-header')
    if (!header) return null
    const headerBottom = header.getBoundingClientRect().bottom
    const tabs = document.querySelector('.tabs')
    if (!tabs) return null
    // The tab strip parks directly beneath the header; if it slides under it,
    // every sticky offset below is wrong too.
    const top = tabs.getBoundingClientRect().top
    return top < headerBottom - 1 ? { top, headerBottom } : null
  })
  if (hidden) {
    failures.push(`${label}: the tab strip sits at ${hidden.top}px, under a header ending at ${hidden.headerBottom}px`)
  }
}

async function assertComposerStartsCompact(page, label) {
  const height = await page.evaluate(() => {
    const element = document.querySelector('.composer textarea')
    return element ? element.getBoundingClientRect().height : null
  })
  // An empty box grew to five lines once, because the auto-grow measured a
  // stale inline height instead of the CSS one.
  if (height !== null && height > 90) {
    failures.push(`${label}: the empty composer is ${Math.round(height)}px tall; it should start at its rows height`)
  }
}

const VIEWPORTS = [
  { label: 'desktop 1440x900', size: { width: 1440, height: 900 }, mobile: false },
  { label: 'tablet 834x1112', size: { width: 834, height: 1112 }, mobile: false },
  { label: 'phone 390x844', size: { width: 390, height: 844 }, mobile: true },
  { label: 'small phone 320x568', size: { width: 320, height: 568 }, mobile: true },
]

const PATHS = ['/', '/?tab=hot', '/about', '/u/octocat']

try {
  for (const viewport of VIEWPORTS) {
    for (const path of PATHS) {
      const label = `${viewport.label} ${path}`
      const page = await open(viewport.size, path, { mobile: viewport.mobile })
      await assertNoHorizontalOverflow(page, label)
      await assertNoIosZoomOnFocus(page, label)
      if (viewport.mobile) await assertTouchTargets(page, label)
      if (path.startsWith('/')) await assertNothingUnderTheHeader(page, label)
      if (path === '/') await assertComposerStartsCompact(page, label)
      await page.close()
    }

    // The first post's thread, which is the only page with a reply composer.
    const feed = await open(viewport.size, '/', { mobile: viewport.mobile })
    const firstThread = await feed.locator('.post-feed a[href^="/p/"]').first().getAttribute('href')
    await feed.close()
    if (firstThread) {
      const label = `${viewport.label} ${firstThread}`
      const page = await open(viewport.size, firstThread, { mobile: viewport.mobile })
      await assertNoHorizontalOverflow(page, label)
      await assertNoIosZoomOnFocus(page, label)
      await assertComposerStartsCompact(page, label)
      if (viewport.mobile) await assertTouchTargets(page, label)
      await page.close()
    }
  }
} finally {
  await browser.close()
}

if (failures.length > 0) {
  console.error(`${failures.length} problem(s):`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log(`Checked ${VIEWPORTS.length} viewports across ${PATHS.length + 1} pages. No problems.`)
