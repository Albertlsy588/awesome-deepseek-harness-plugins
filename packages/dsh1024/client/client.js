window.__ModuleLoader__.load({ id: "dsh1024", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
'use strict'

const React = require('react')
const h = React.createElement
const { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } = React
const NS = 'dsh1024'

/**
 * 本体的 UI 基元。它在平台 seed 表里,同步 require 拿到的是 shell 同一个实例,
 * CSS 已随 shell 加载,零打包成本。
 *
 * 但同步 require 只认那张 seed 表 —— require 一个不在表里的包会 throw,并且
 * 会把整个 factory 一起炸掉。所以这里必须兜底:拿不到就回退自绘,面板绝不能白屏。
 */
let primitives = null
try {
  primitives = require('@deepseek-ai/dsh-client-ui-primitives')
} catch {
  primitives = null
}
const SITE_URL = 'https://deepseek1024.com/'

const zh = {
  tab: '1024 Store', title: '1024 Store', subtitle: '发现并安装经过目录校验的社区插件',
  discover: '发现', installed: '已安装', all: '全部', search: '搜索名称、作者或功能…',
  popular: '热门', newest: '最新', install: '安装', installing: '安装中…',
  remove: '卸载', removing: '卸载中…', source: '源码', empty: '没有匹配的插件',
  more: '加载更多', expand: '展开全部分类', collapse: '收起分类',
  loading: '正在加载插件目录…', loadFailed: '目录加载失败，请稍后重试。',
  confirmInstall: '这是社区第三方代码。确认信任来源并安装',
  confirmRemove: '确认卸载', restart: '项变更已完成，重启 DeepSeek Harness 后生效。',
  retry: '重试', cached: '目录 API 暂不可用，当前显示最近一次成功缓存。', operationFailed: '操作失败',
  updateReady: '发现 1024 Store 新版本', current: '当前', latest: '最新',
  viewUpdate: '查看更新', upToDate: '已是最新', website: '访问 1024 主站',
}

const en = {
  tab: '1024 Store', title: '1024 Store', subtitle: 'Discover and install catalog-validated community plugins',
  discover: 'Discover', installed: 'Installed', all: 'All', search: 'Search by name, owner, or capability…',
  popular: 'Popular', newest: 'Newest', install: 'Install', installing: 'Installing…',
  remove: 'Uninstall', removing: 'Removing…', source: 'Source', empty: 'No matching plugins',
  more: 'Load more', expand: 'Show all categories', collapse: 'Show fewer categories',
  loading: 'Loading the plugin catalog…', loadFailed: 'The catalog could not be loaded. Try again later.',
  confirmInstall: 'This is third-party community code. Trust this source and install',
  confirmRemove: 'Uninstall', restart: 'change(s) completed. Restart DeepSeek Harness to apply them.',
  retry: 'Retry', cached: 'The catalog API is unavailable. Showing the last successful cache.', operationFailed: 'Operation failed',
  updateReady: 'A new 1024 Store version is available', current: 'current', latest: 'latest',
  viewUpdate: 'View update', upToDate: 'Up to date', website: 'Visit 1024',
}

let catalogCount = null
const catalogCountListeners = new Set()

function publishCatalogCount(count) {
  if (!Number.isInteger(count) || count < 0 || count === catalogCount) return
  catalogCount = count
  for (const listener of catalogCountListeners) listener()
}

function subscribeCatalogCount(listener) {
  catalogCountListeners.add(listener)
  return () => catalogCountListeners.delete(listener)
}

function readCatalogCount() {
  return catalogCount
}

/** 订阅目录总数;数据变了徽标自己更新,不再靠 dispose + 重新 register。 */
function useCatalogCount() {
  return useSyncExternalStore(subscribeCatalogCount, readCatalogCount, readCatalogCount)
}

const CSS = `
.dsm-root{color:var(--dsw-alias-label-primary);container-type:inline-size;display:flex;flex-direction:column;gap:14px;min-width:0}
.dsm-head{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap}
.dsm-brand{min-width:0;flex:1 1 260px}.dsm-brand h3{font-size:20px;line-height:1.25;margin:0 0 3px}.dsm-brand p{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.5;margin:0}
.dsm-meta{align-items:center;display:flex;gap:8px;flex-wrap:wrap}.dsm-pill{background:var(--dsw-alias-bg-layer-2);border-radius:999px;color:var(--dsw-alias-label-secondary);font-size:12px;padding:5px 9px}.dsm-site-link{color:var(--dsw-alias-brand-primary);font-size:12px;font-weight:650;text-decoration:none;white-space:nowrap}.dsm-site-link:hover{text-decoration:underline}
.dsm-notice{align-items:center;background:color-mix(in srgb,var(--dsw-alias-state-warn-secondary) 14%,var(--dsw-alias-bg-layer-1));border:1px solid color-mix(in srgb,var(--dsw-alias-state-warn-secondary) 42%,transparent);color:var(--dsw-alias-state-warn-label);border-radius:10px;display:flex;font-size:13px;gap:8px;line-height:1.45;padding:10px 12px}
.dsm-update-link{color:inherit;font-weight:700;margin-left:auto;white-space:nowrap}
.dsm-error{background:color-mix(in srgb,var(--dsw-alias-state-error-secondary) 14%,var(--dsw-alias-bg-layer-1));border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-secondary) 42%,transparent);border-radius:10px;color:var(--dsw-alias-state-error-primary);font-size:13px;padding:10px 12px;white-space:pre-wrap;word-break:break-word}
.dsm-toolbar{display:flex;flex-direction:column;gap:10px}.dsm-search{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l3);border-radius:10px;color:inherit;font:inherit;min-height:42px;padding:0 13px;width:100%}
.dsm-row{align-items:center;display:flex;gap:8px}.dsm-row-spacer{flex:1 0 12px}
/* 分类不再横向滚动:本体 Pill 几何(h24 / 12px / gap6)整片铺开,默认最多 3 行,
   超出才出现展开按钮。564px 面板下是 3 行 84px,按钮不出现。 */
.dsm-cats{display:flex;flex-wrap:wrap;gap:6px}
.dsm-cats[data-clamped=true]{max-height:84px;overflow:hidden}
.dsm-cat{appearance:none;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l3);border-radius:999px;color:inherit;cursor:pointer;font:inherit;font-size:12px;height:24px;line-height:1;padding:0 12px;white-space:nowrap}
.dsm-cat[data-active=true]{background:var(--dsw-alias-button-ghost-active-fill);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);font-weight:650}
.dsm-cats-toggle{align-self:flex-start;background:none;border:0;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px;padding:2px 0;text-decoration:underline}
.dsm-chip,.dsm-action{appearance:none;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l3);border-radius:9px;color:inherit;cursor:pointer;font:inherit;font-size:13px;min-height:38px;padding:7px 12px;white-space:nowrap}
.dsm-chip[data-active=true]{background:var(--dsw-alias-button-ghost-active-fill);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);font-weight:650}
.dsm-action{background:var(--dsw-alias-brand-primary);border-color:transparent;color:var(--dsw-alias-label-primary-foreground);font-weight:650}.dsm-action[data-kind=remove]{background:transparent;border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.dsm-action[data-kind=installed]{background:var(--dsw-alias-bg-layer-2);border-color:transparent;color:var(--dsw-alias-label-secondary);cursor:default}.dsm-action:disabled{cursor:not-allowed;opacity:.55}
.dsm-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))}
.dsm-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;display:flex;flex-direction:column;gap:10px;min-width:0;padding:13px}
.dsm-card-head{align-items:flex-start;display:flex;gap:10px}.dsm-avatar{align-items:center;background:var(--dsm-avatar,#4f46e5);border-radius:9px;color:#fff;display:flex;flex:0 0 36px;font-size:15px;font-weight:750;height:36px;justify-content:center}
.dsm-name{font-size:14px;font-weight:700;line-height:1.35;overflow-wrap:anywhere}.dsm-owner{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}.dsm-source{color:var(--dsw-alias-brand-primary);font-size:12px;margin-left:auto;text-decoration:none;white-space:nowrap}
.dsm-desc{color:var(--dsw-alias-label-secondary);display:-webkit-box;font-size:13px;line-height:1.5;min-height:39px;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2}
.dsm-card-foot{align-items:center;display:flex;gap:8px;margin-top:auto}.dsm-category{background:var(--dsw-alias-bg-layer-2);border-radius:999px;color:var(--dsw-alias-label-secondary);font-size:11px;max-width:55%;overflow:hidden;padding:4px 8px;text-overflow:ellipsis;white-space:nowrap}.dsm-grow{flex:1}
.dsm-state{align-items:center;color:var(--dsw-alias-label-secondary);display:flex;font-size:13px;gap:8px;justify-content:center;min-height:140px;text-align:center}.dsm-spin{animation:dsm-spin .8s linear infinite;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;display:inline-block;height:15px;width:15px}@keyframes dsm-spin{to{transform:rotate(360deg)}}
.dsm-more{display:flex;justify-content:center;padding:4px 0 8px}
/* 侧边栏席位:wide 是整行,窄栏是 36×36 圆形 rail 态(装不下数字,总数走 aria-label)。 */
.dsm-rail{align-items:center;appearance:none;background:none;border:0;border-radius:8px;color:inherit;cursor:pointer;display:flex;font:inherit;font-size:13px;gap:8px;min-height:32px;padding:0 8px;width:100%}
.dsm-rail:hover{background:var(--dsw-alias-button-ghost-active-fill)}
.dsm-rail[data-wide=false]{border-radius:50%;height:36px;justify-content:center;padding:0;width:36px}
.dsm-rail-icon{align-items:center;display:flex;flex:0 0 16px;height:16px;justify-content:center;width:16px}
.dsm-rail-label{flex:1;overflow:hidden;text-align:left;text-overflow:ellipsis;white-space:nowrap}
/* 徽标语汇照抄本体 footer 面板:margin-left:auto、12/16、tertiary、tabular-nums。 */
.dsm-rail-badge{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px;margin-left:auto;font-variant-numeric:tabular-nums}
.dsm-pop-backdrop{inset:0;position:fixed;z-index:2147483000}
.dsm-pop{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;bottom:12px;box-shadow:0 12px 40px rgba(0,0,0,.24);display:flex;flex-direction:column;left:12px;max-height:min(760px,calc(100vh - 24px));overflow:auto;padding:14px;position:fixed;width:min(564px,calc(100vw - 24px));z-index:2147483001}
@media(max-width:640px){.dsm-root{gap:12px}.dsm-meta{width:100%}.dsm-grid{grid-template-columns:1fr}.dsm-card{padding:12px}.dsm-action,.dsm-chip{min-height:42px}.dsm-source{padding:5px 0}}
@container(max-width:360px){.dsm-head{display:block}.dsm-brand h3{font-size:18px}.dsm-meta{align-items:flex-start;flex-direction:column;margin-top:8px;width:auto}.dsm-pill{display:block}.dsm-card{position:relative}.dsm-card-head{display:block;padding-right:18px}.dsm-avatar{display:none}.dsm-source{font-size:0;margin:0;padding:6px;position:absolute;right:5px;top:4px}.dsm-source:after{content:'↗';font-size:15px}.dsm-name{font-size:13px;overflow-wrap:break-word}.dsm-desc,.dsm-category{display:none}.dsm-card-foot{display:block}.dsm-action{margin-top:2px;width:100%}.dsm-row-spacer{display:none}.dsm-cats[data-clamped=true]{max-height:112px}}
@container(max-width:180px){.dsm-root{gap:8px}.dsm-brand p{display:none}.dsm-meta{gap:3px;margin-top:5px}.dsm-pill{background:transparent;font-size:11px;padding:0 8px}.dsm-toolbar{gap:6px}.dsm-cats{gap:4px}.dsm-cat{font-size:11px;padding:0 9px}.dsm-search{font-size:11px;min-height:34px;padding:0 9px}.dsm-row{gap:5px}.dsm-chip,.dsm-action{font-size:11px;min-height:34px;padding:5px 9px}.dsm-card{gap:6px;padding:8px}.dsm-card-head{padding-right:0}.dsm-source{display:none}.dsm-name,.dsm-owner{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsm-name{font-size:12px}.dsm-owner{font-size:11px}.dsm-card-foot{margin-top:0}.dsm-action{margin-top:0}.dsm-more{padding-top:0}}
`

/**
 * 注入面板样式。
 *
 * 两件事必须这样做:
 * 1. 打上 data-plugin / data-plugin-css。宿主的 claimStyles 会把页面上任何
 *    未打标的 <style> 认领给「当时正在物化的插件」,那个插件热更新卸载时会
 *    把我们的样式一并删掉。打标之后这块样式明确归我们。
 * 2. 在 factory 体顶层调用,而不是等面板挂载。侧边栏入口在面板从未打开过时
 *    也要有样式,放进组件的 effect 里那会儿它已经是裸的了。
 */
function injectStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById('dsh1024-style') !== null) return
  const style = document.createElement('style')
  style.id = 'dsh1024-style'
  style.setAttribute('data-plugin', NS)
  style.setAttribute('data-plugin-css', NS)
  style.textContent = CSS
  document.head.appendChild(style)
}

injectStyles()

function repositoryOf(url) {
  const match = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/?$/.exec(url)
  return match ? match[1] : null
}

// Source lives in the subdirectory for a monorepo subpackage; HEAD resolves to
// the repository's default branch. Issue trackers stay repository-level.
function sourceUrl(plugin) {
  const path = subPathOf(plugin)
  if (path === '') return plugin.url
  const segments = path.split('/').map(encodeURIComponent).join('/')
  return plugin.url.replace(/\/+$/, '') + '/tree/HEAD/' + segments
}

function subPathOf(plugin) {
  const segments = String(plugin.id || '').split('/')
  return segments.length > 2 ? segments.slice(2).join('/') : ''
}

function installedName(plugin, installed) {
  if (installed[plugin.name] !== undefined) return plugin.name
  const repository = repositoryOf(plugin.url)
  if (repository === null) return null
  const needle = ('github:' + repository).toLowerCase()
  // Monorepo siblings share a repository, so the spec's path: fragment is what
  // distinguishes them.
  const wantedPath = subPathOf(plugin).toLowerCase()
  for (const [name, spec] of Object.entries(installed)) {
    const normalized = String(spec).toLowerCase()
    if (!normalized.includes(needle)) continue
    const match = /[#&]path:\/*([^&]*)/.exec(normalized)
    const specPath = (match ? match[1] : '').replace(/\/+$/, '')
    if (specPath === wantedPath) return name
  }
  return null
}

function avatarColor(name) {
  let hash = 0
  for (let index = 0; index < name.length; index++) hash = (hash * 31 + name.charCodeAt(index)) | 0
  return 'hsl(' + (((hash % 360) + 360) % 360) + ' 58% 48%)'
}

function responseJson(response) {
  return response.json().catch(() => ({})).then(body => ({ status: response.status, body }))
}

function MarketTab({ locale }) {
  const localeSnapshot = React.useSyncExternalStore(
    listener => locale.subscribe(listener),
    () => locale.getSnapshot(),
  )
  const lang = String(localeSnapshot.active).toLowerCase().startsWith('zh') ? 'zh' : 'en'
  const copy = lang === 'zh' ? zh : en
  const [registry, setRegistry] = useState(null)
  const [registrySource, setRegistrySource] = useState(null)
  const [updateInfo, setUpdateInfo] = useState(null)
  const [installed, setInstalled] = useState({})
  const [view, setView] = useState('discover')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState('popular')
  const [busy, setBusy] = useState(null)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [restartChanges, setRestartChanges] = useState(0)
  const [visibleCount, setVisibleCount] = useState(40)
  // 分类整片铺开,只有真的超过三行才给展开兜底(564px 面板下不会出现)。
  const [categoriesExpanded, setCategoriesExpanded] = useState(false)
  const [categoriesOverflow, setCategoriesOverflow] = useState(false)
  const catsRef = useRef(null)

  const refreshInstalled = useCallback(() => {
    return fetch('/dsh1024/installed', { cache: 'no-store' })
      .then(responseJson)
      .then(({ status, body }) => {
        if (status !== 200) throw new Error(body.error || 'HTTP ' + status)
        setInstalled(body.installed || {})
      })
  }, [])

  const load = useCallback(() => {
    setLoadFailed(false)
    setError(null)
    return Promise.all([
      fetch('/dsh1024/registry', { cache: 'no-store' }).then(responseJson),
      refreshInstalled(),
      fetch('/dsh1024/update', { cache: 'no-store' })
        .then(responseJson)
        .then(({ status, body }) => status === 200 ? body : null)
        .catch(() => null),
    ]).then(([result, , nextUpdateInfo]) => {
      if (result.status !== 200 || !result.body.registry) throw new Error(result.body.error || 'HTTP ' + result.status)
      setRegistry(result.body.registry)
      setRegistrySource(result.body.source || null)
      setUpdateInfo(nextUpdateInfo)
      publishCatalogCount(result.body.registry.count)
    }).catch(operationError => {
      setLoadFailed(true)
      setError(String(operationError))
    })
  }, [refreshInstalled])

  // Stale-while-revalidate, silent half: the panel already rendered whatever the
  // process had cached, so this asks for the current catalog behind it and swaps
  // the list in only when it actually moved. No spinner, no toast, no error —
  // a failed refresh just leaves the visible catalog alone.
  const revalidating = useRef(false)
  const revalidate = useCallback(() => {
    if (revalidating.current) return Promise.resolve()
    revalidating.current = true
    return fetch('/dsh1024/registry?revalidate=1', { cache: 'no-store' })
      .then(responseJson)
      .then(({ status, body }) => {
        if (status !== 200 || !body.registry) return
        setRegistry(previous => {
          if (previous !== null
            && previous.updated === body.registry.updated
            && previous.count === body.registry.count) return previous
          return body.registry
        })
        setRegistrySource(body.source || null)
        publishCatalogCount(body.registry.count)
      })
      .catch(() => {})
      .finally(() => { revalidating.current = false })
  }, [])

  useEffect(() => { load().then(revalidate) }, [load, revalidate])

  // 面板宽度和分类数量都会变,用 ResizeObserver 判断是否真的溢出三行。
  useEffect(() => {
    const node = catsRef.current
    if (node === null || typeof ResizeObserver === 'undefined') return undefined
    const measure = () => setCategoriesOverflow(node.scrollHeight > node.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [categories, categoriesExpanded, registry])

  // Coming back to a panel that has been sitting open for hours should not show
  // an hours-old catalog either.
  useEffect(() => {
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return undefined
    const onVisible = () => { if (document.visibilityState === 'visible') revalidate() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [revalidate])

  useEffect(() => {
    if (busy === null) { setProgress(''); return undefined }
    const timer = setInterval(() => {
      fetch('/dsh1024/status', { cache: 'no-store' })
        .then(responseJson)
        .then(({ body }) => {
          if (body.active) setProgress((body.lastLine || '…') + ' · ' + body.seconds + 's')
        })
        .catch(() => {})
    }, 1000)
    return () => clearInterval(timer)
  }, [busy])

  const mutate = useCallback((kind, value) => {
    const label = kind === 'install' ? value.name : value
    const prompt = kind === 'install'
      ? copy.confirmInstall + ' “' + value.name + '”?\n\n' + value.url
      : copy.confirmRemove + ' “' + value + '”?'
    if (!window.confirm(prompt)) return
    setBusy(kind + ':' + label)
    setError(null)
    fetch('/dsh1024/' + kind, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(kind === 'install' ? { id: value.id } : { name: value }),
    })
      .then(responseJson)
      .then(({ status, body }) => {
        if (status !== 200 || !body.ok) {
          const detail = body.error || body.stderr || body.stdout || ('HTTP ' + status)
          throw new Error(String(detail).trim().slice(-800))
        }
        setInstalled(body.installed || {})
        setRestartChanges(count => count + 1)
      })
      .catch(operationError => setError(copy.operationFailed + ': ' + String(operationError)))
      .finally(() => setBusy(null))
  }, [copy])

  const installedCatalogCount = useMemo(() => registry === null ? 0 : registry.plugins.reduce(
    (count, plugin) => count + (installedName(plugin, installed) === null ? 0 : 1),
    0,
  ), [installed, registry])

  const plugins = useMemo(() => {
    if (registry === null) return []
    const needle = query.trim().toLowerCase()
    const visible = registry.plugins.filter(plugin => {
      if (view === 'installed' && installedName(plugin, installed) === null) return false
      if (category !== 'all' && plugin.category !== category) return false
      if (needle === '') return true
      const description = plugin.description[lang] || plugin.description.en || ''
      return (plugin.name + ' ' + plugin.owner + ' ' + description).toLowerCase().includes(needle)
    })
    return [...visible].sort((left, right) => sort === 'newest'
      ? String(right.added).localeCompare(String(left.added))
      : (right.stars ?? -1) - (left.stars ?? -1))
  }, [category, installed, lang, query, registry, sort, view])

  useEffect(() => { setVisibleCount(40) }, [category, query, sort, view])

  const categoryLabels = useMemo(() => {
    const labels = {}
    for (const entry of registry === null ? [] : registry.categories) labels[entry.id] = entry.label || {}
    return labels
  }, [registry])
  const categories = useMemo(() => registry === null
    ? []
    : [...registry.categories]
        .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
        .map(entry => entry.id), [registry])

  const cards = plugins.slice(0, visibleCount).map(plugin => {
    const packageName = installedName(plugin, installed)
    const installing = busy === 'install:' + plugin.name
    const removing = packageName !== null && busy === 'uninstall:' + packageName
    const description = plugin.description[lang] || plugin.description.en || ''
    const categoryLabel = categoryLabels[plugin.category]?.[lang]
      || categoryLabels[plugin.category]?.en
      || plugin.category
    return h('article', { className: 'dsm-card', key: plugin.id },
      h('div', { className: 'dsm-card-head' },
        h('div', { className: 'dsm-avatar', style: { '--dsm-avatar': avatarColor(plugin.name) } },
          plugin.name.replace(/^dsh[-_]/i, '').charAt(0).toUpperCase() || 'P'),
        h('div', { style: { minWidth: 0 } },
          h('div', { className: 'dsm-name' }, plugin.name),
          h('div', { className: 'dsm-owner' }, plugin.owner,
            typeof plugin.stars === 'number' ? ' · ★ ' + plugin.stars : '')),
        h('a', { className: 'dsm-source', href: sourceUrl(plugin), target: '_blank', rel: 'noreferrer' }, copy.source)),
      h('div', { className: 'dsm-desc' }, description),
      (installing || removing) && h('div', { className: 'dsm-owner' },
        h('span', { className: 'dsm-spin' }), ' ', progress || (installing ? copy.installing : copy.removing)),
      h('div', { className: 'dsm-card-foot' },
        h('span', { className: 'dsm-category' }, categoryLabel),
        h('span', { className: 'dsm-grow' }),
        packageName === null
          ? h('button', {
              className: 'dsm-action', type: 'button', disabled: busy !== null,
              onClick: () => mutate('install', plugin),
            }, installing ? copy.installing : copy.install)
          : packageName === 'dsh1024'
            ? h('button', { className: 'dsm-action', type: 'button', disabled: true, 'data-kind': 'installed' }, copy.installed)
            : h('button', {
                className: 'dsm-action', type: 'button', disabled: busy !== null, 'data-kind': 'remove',
                onClick: () => mutate('uninstall', packageName),
              }, removing ? copy.removing : copy.remove)))
  })

  return h('div', { className: 'dsm-root' },
    h('div', { className: 'dsm-head' },
      h('div', { className: 'dsm-brand' }, h('h3', null, copy.title), h('p', null, copy.subtitle)),
      h('div', { className: 'dsm-meta' },
        h('a', { className: 'dsm-site-link', href: SITE_URL, target: '_blank', rel: 'noreferrer' }, copy.website, ' ↗'),
        updateInfo !== null && h('span', { className: 'dsm-pill' },
          'v' + updateInfo.currentVersion + (updateInfo.checked && !updateInfo.updateAvailable ? ' · ' + copy.upToDate : '')),
        registry !== null && h('span', { className: 'dsm-pill' }, registry.updated))),
    registrySource === 'cache' && h('div', { className: 'dsm-notice' }, 'ℹ️ ', copy.cached),
    updateInfo?.updateAvailable && h('div', { className: 'dsm-notice' },
      h('span', null, '↑ ', copy.updateReady, '：', copy.current, ' v', updateInfo.currentVersion,
        ' · ', copy.latest, ' v', updateInfo.latestVersion),
      h('a', { className: 'dsm-update-link', href: updateInfo.releaseUrl, target: '_blank', rel: 'noreferrer' }, copy.viewUpdate)),
    restartChanges > 0 && h('div', { className: 'dsm-notice' }, '↻ ', h('b', null, restartChanges), ' ', copy.restart),
    error !== null && h('div', { className: 'dsm-error' }, error),
    h('div', { className: 'dsm-toolbar' },
      h('input', {
        className: 'dsm-search', type: 'search', value: query, placeholder: copy.search,
        onChange: event => setQuery(event.target.value),
      }),
      h('div', { className: 'dsm-row' },
        h('button', { className: 'dsm-chip', type: 'button', 'data-active': view === 'discover', onClick: () => setView('discover') }, copy.discover),
        h('button', { className: 'dsm-chip', type: 'button', 'data-active': view === 'installed', onClick: () => setView('installed') }, copy.installed + ' (' + installedCatalogCount + ')'),
        h('span', { className: 'dsm-row-spacer' }),
        h('button', { className: 'dsm-chip', type: 'button', 'data-active': sort === 'popular', onClick: () => setSort('popular') }, copy.popular),
        h('button', { className: 'dsm-chip', type: 'button', 'data-active': sort === 'newest', onClick: () => setSort('newest') }, copy.newest)),
      h('div', { className: 'dsm-cats', ref: catsRef, 'data-clamped': !categoriesExpanded },
        h('button', { className: 'dsm-cat', type: 'button', 'data-active': category === 'all', onClick: () => setCategory('all') }, copy.all),
        categories.map(id => h('button', {
          className: 'dsm-cat', key: id, type: 'button', 'data-active': category === id,
          onClick: () => setCategory(id),
        }, categoryLabels[id]?.[lang] || categoryLabels[id]?.en || id))),
      categoriesOverflow && h('button', {
        className: 'dsm-cats-toggle', type: 'button',
        onClick: () => setCategoriesExpanded(value => !value),
      }, categoriesExpanded ? copy.collapse : copy.expand)),
    loadFailed
      ? h('div', { className: 'dsm-state' }, h('span', null, copy.loadFailed, ' ',
          h('button', { className: 'dsm-chip', type: 'button', onClick: load }, copy.retry)))
      : registry === null
        ? h('div', { className: 'dsm-state' }, h('span', { className: 'dsm-spin' }), copy.loading)
        : plugins.length === 0
          ? h('div', { className: 'dsm-state' }, copy.empty)
          : h(React.Fragment, null,
              h('div', { className: 'dsm-grid' }, cards),
              visibleCount < plugins.length && h('div', { className: 'dsm-more' },
                h('button', {
                  className: 'dsm-chip', type: 'button', onClick: () => setVisibleCount(count => count + 40),
                }, copy.more + ' (' + visibleCount + '/' + plugins.length + ')'))))
}

/** 侧边栏席位:图标 + 名称 + 总数徽标;点开自己的浮层。 */
function SidebarEntry({ wide, locale }) {
  const t = locale.bind(NS)
  const count = useCatalogCount()
  const [open, setOpen] = useState(false)
  const label = t('tab')
  const title = count === null ? label : label + ' (' + count + ')'

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = event => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  const Icon = primitives?.IconDownloadOutline16
  return h(React.Fragment, null,
    h('button', {
      className: 'dsm-rail', type: 'button', 'data-wide': wide !== false,
      title, 'aria-label': title, 'aria-expanded': open,
      onClick: () => setOpen(value => !value),
    },
      h('span', { className: 'dsm-rail-icon', 'aria-hidden': true },
        Icon ? h(Icon, null) : '\u2b07'),
      wide !== false && h('span', { className: 'dsm-rail-label' }, label),
      wide !== false && count !== null && h('span', { className: 'dsm-rail-badge' }, count)),
    open && h(React.Fragment, null,
      h('div', { className: 'dsm-pop-backdrop', onClick: () => setOpen(false) }),
      h('div', { className: 'dsm-pop', role: 'dialog', 'aria-label': label },
        h(MarketTab, { locale }))))
}

exports.name = 'dsh1024/client'
exports.inject = ['slots', 'locale']
exports.apply = function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh1024: dictionaries')
  const t = ctx.locale.bind(NS)
  fetch('/dsh1024/registry', { cache: 'no-store' })
    .then(responseJson)
    .then(({ status, body }) => {
      if (status === 200 && body.registry) publishCatalogCount(body.registry.count)
    })
    .catch(() => {})
  ctx.slots.inject('settings.plugins.tab', () => {
    let disposeEntry = () => {}
    const register = () => {
      disposeEntry = ctx.slots.register({
        name: 'settings.plugins.tab',
        id: '1024store',
        order: 20,
        label: () => t('tab') + (catalogCount === null ? '' : ' (' + catalogCount + ')'),
        locale: NS,
      }, () => h(MarketTab, { locale: ctx.locale }))
    }
    register()
    const unsubscribe = subscribeCatalogCount(() => {
      disposeEntry()
      register()
    })
    return () => {
      unsubscribe()
      disposeEntry()
    }
  })
  // 必须包在 slots.inject 里:裸 register 打进未声明的槽会抛错。
  // id 用我们自己的,绝不能复用官方面板的 id(会把它顶掉);
  // order 10 让我们稳定排在官方面板之下、设置之上。
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'dsh1024-store',
    order: 10,
    label: () => t('tab'),
    locale: NS,
  }, props => h(SidebarEntry, { wide: props?.wide !== false, locale: ctx.locale })))
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: '1024store',
    order: 100,
    label: () => t('tab'),
    locale: NS,
  }, () => h(MarketTab, { locale: ctx.locale })))
}

return module.exports; } });
