window.__ModuleLoader__.load({ id: "dsh-1024store", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
'use strict'

const React = require('react')
const h = React.createElement
const { useCallback, useEffect, useMemo, useState } = React
const NS = 'dsh-1024store'
const SITE_URL = 'https://deepseek1024.com/'

const zh = {
  tab: '1024 Store', title: '1024 Store', subtitle: '发现并安装经过目录校验的社区插件',
  discover: '发现', installed: '已安装', all: '全部', search: '搜索名称、作者或功能…',
  popular: '热门', newest: '最新', install: '安装', installing: '安装中…',
  remove: '卸载', removing: '卸载中…', source: '源码', empty: '没有匹配的插件',
  more: '加载更多',
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
  more: 'Load more',
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

const CSS = `
.dsm-root{color:var(--dsw-alias-label-primary,#202124);container-type:inline-size;display:flex;flex-direction:column;gap:14px;min-width:0}
.dsm-head{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap}
.dsm-brand{min-width:0;flex:1 1 260px}.dsm-brand h3{font-size:20px;line-height:1.25;margin:0 0 3px}.dsm-brand p{color:var(--dsw-alias-label-secondary,#667085);font-size:13px;line-height:1.5;margin:0}
.dsm-meta{align-items:center;display:flex;gap:8px;flex-wrap:wrap}.dsm-pill{background:var(--dsw-alias-bg-layer-2,#f2f4f7);border-radius:999px;color:var(--dsw-alias-label-secondary,#667085);font-size:12px;padding:5px 9px}.dsm-site-link{color:var(--dsw-alias-brand-primary,#4338ca);font-size:12px;font-weight:650;text-decoration:none;white-space:nowrap}.dsm-site-link:hover{text-decoration:underline}
.dsm-notice{align-items:center;background:var(--dsw-alias-state-warn-secondary,#fff7e6);border:1px solid var(--dsw-alias-state-warn-border,#f4c76b);border-radius:10px;display:flex;font-size:13px;gap:8px;line-height:1.45;padding:10px 12px}
.dsm-update-link{color:inherit;font-weight:700;margin-left:auto;white-space:nowrap}
.dsm-error{background:var(--dsw-alias-state-danger-secondary,#fff0f0);border:1px solid var(--dsw-alias-state-danger-border,#eaa);border-radius:10px;color:var(--dsw-alias-state-danger-primary,#a12626);font-size:13px;padding:10px 12px;white-space:pre-wrap;word-break:break-word}
.dsm-toolbar{display:flex;flex-direction:column;gap:10px}.dsm-search{background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-normal,#d0d5dd);border-radius:10px;color:inherit;font:inherit;min-height:42px;padding:0 13px;width:100%}
.dsm-row{align-items:center;display:flex;gap:8px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}.dsm-row::-webkit-scrollbar{display:none}.dsm-row-spacer{flex:1 0 12px}
.dsm-chip,.dsm-action{appearance:none;background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-normal,#d0d5dd);border-radius:9px;color:inherit;cursor:pointer;font:inherit;font-size:13px;min-height:38px;padding:7px 12px;white-space:nowrap}
.dsm-chip[data-active=true]{background:var(--dsw-alias-brand-secondary,#eef2ff);border-color:var(--dsw-alias-brand-primary,#4f46e5);color:var(--dsw-alias-brand-primary,#4338ca);font-weight:650}
.dsm-action{background:var(--dsw-alias-brand-primary,#4f46e5);border-color:transparent;color:var(--dsw-alias-button-primary-foreground,#fff);font-weight:650}.dsm-action[data-kind=remove]{background:transparent;border-color:var(--dsw-alias-state-danger-border,#dc6b6b);color:var(--dsw-alias-state-danger-primary,#b42318)}
.dsm-action[data-kind=installed]{background:var(--dsw-alias-bg-layer-2,#f2f4f7);border-color:transparent;color:var(--dsw-alias-label-secondary,#667085);cursor:default}.dsm-action:disabled{cursor:not-allowed;opacity:.55}
.dsm-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))}
.dsm-card{background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-subtle,#e4e7ec);border-radius:12px;display:flex;flex-direction:column;gap:10px;min-width:0;padding:13px}
.dsm-card-head{align-items:flex-start;display:flex;gap:10px}.dsm-avatar{align-items:center;background:var(--dsm-avatar,#4f46e5);border-radius:9px;color:#fff;display:flex;flex:0 0 36px;font-size:15px;font-weight:750;height:36px;justify-content:center}
.dsm-name{font-size:14px;font-weight:700;line-height:1.35;overflow-wrap:anywhere}.dsm-owner{color:var(--dsw-alias-label-tertiary,#7c8594);font-size:12px;line-height:1.5}.dsm-source{color:var(--dsw-alias-brand-primary,#4f46e5);font-size:12px;margin-left:auto;text-decoration:none;white-space:nowrap}
.dsm-desc{color:var(--dsw-alias-label-secondary,#586174);display:-webkit-box;font-size:13px;line-height:1.5;min-height:39px;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2}
.dsm-card-foot{align-items:center;display:flex;gap:8px;margin-top:auto}.dsm-category{background:var(--dsw-alias-bg-layer-2,#f2f4f7);border-radius:999px;color:var(--dsw-alias-label-secondary,#667085);font-size:11px;max-width:55%;overflow:hidden;padding:4px 8px;text-overflow:ellipsis;white-space:nowrap}.dsm-grow{flex:1}
.dsm-state{align-items:center;color:var(--dsw-alias-label-secondary,#667085);display:flex;font-size:13px;gap:8px;justify-content:center;min-height:140px;text-align:center}.dsm-spin{animation:dsm-spin .8s linear infinite;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;display:inline-block;height:15px;width:15px}@keyframes dsm-spin{to{transform:rotate(360deg)}}
.dsm-more{display:flex;justify-content:center;padding:4px 0 8px}
@media(max-width:640px){.dsm-root{gap:12px}.dsm-meta{width:100%}.dsm-row{margin-left:-2px;margin-right:-2px}.dsm-grid{grid-template-columns:1fr}.dsm-card{padding:12px}.dsm-action,.dsm-chip{min-height:42px}.dsm-source{padding:5px 0}}
@container(max-width:360px){.dsm-head{display:block}.dsm-brand h3{font-size:18px}.dsm-meta{align-items:flex-start;flex-direction:column;margin-top:8px;width:auto}.dsm-pill{display:block}.dsm-card{position:relative}.dsm-card-head{display:block;padding-right:18px}.dsm-avatar{display:none}.dsm-source{font-size:0;margin:0;padding:6px;position:absolute;right:5px;top:4px}.dsm-source:after{content:'↗';font-size:15px}.dsm-name{font-size:13px;overflow-wrap:break-word}.dsm-desc,.dsm-category{display:none}.dsm-card-foot{display:block}.dsm-action{margin-top:2px;width:100%}.dsm-row-spacer{display:none}}
@container(max-width:180px){.dsm-root{gap:8px}.dsm-brand p{display:none}.dsm-meta{gap:3px;margin-top:5px}.dsm-pill{background:transparent;font-size:11px;padding:0 8px}.dsm-toolbar{gap:6px}.dsm-search{font-size:11px;min-height:34px;padding:0 9px}.dsm-row{gap:5px}.dsm-chip,.dsm-action{font-size:11px;min-height:34px;padding:5px 9px}.dsm-card{gap:6px;padding:8px}.dsm-card-head{padding-right:0}.dsm-source{display:none}.dsm-name,.dsm-owner{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsm-name{font-size:12px}.dsm-owner{font-size:11px}.dsm-card-foot{margin-top:0}.dsm-action{margin-top:0}.dsm-more{padding-top:0}}
`

function injectStyles() {
  if (document.getElementById('dsh-1024store-style')) return
  const style = document.createElement('style')
  style.id = 'dsh-1024store-style'
  style.textContent = CSS
  document.head.appendChild(style)
}

function repositoryOf(url) {
  const match = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/?$/.exec(url)
  return match ? match[1] : null
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

  const refreshInstalled = useCallback(() => {
    return fetch('/dsh-1024store/installed', { cache: 'no-store' })
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
      fetch('/dsh-1024store/registry', { cache: 'no-store' }).then(responseJson),
      refreshInstalled(),
      fetch('/dsh-1024store/update', { cache: 'no-store' })
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

  useEffect(() => { injectStyles(); load() }, [load])

  useEffect(() => {
    if (busy === null) { setProgress(''); return undefined }
    const timer = setInterval(() => {
      fetch('/dsh-1024store/status', { cache: 'no-store' })
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
    fetch('/dsh-1024store/' + kind, {
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
        h('a', { className: 'dsm-source', href: plugin.url, target: '_blank', rel: 'noreferrer' }, copy.source)),
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
          : packageName === 'dsh-1024store'
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
      h('div', { className: 'dsm-row' },
        h('button', { className: 'dsm-chip', type: 'button', 'data-active': category === 'all', onClick: () => setCategory('all') }, copy.all),
        categories.map(id => h('button', {
          className: 'dsm-chip', key: id, type: 'button', 'data-active': category === id,
          onClick: () => setCategory(id),
        }, categoryLabels[id]?.[lang] || categoryLabels[id]?.en || id)))),
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

exports.name = 'dsh-1024store/client'
exports.inject = ['slots', 'locale']
exports.apply = function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-1024store: dictionaries')
  const t = ctx.locale.bind(NS)
  fetch('/dsh-1024store/registry', { cache: 'no-store' })
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
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: '1024store',
    order: 100,
    label: () => t('tab'),
    locale: NS,
  }, () => h(MarketTab, { locale: ctx.locale })))
}

return module.exports; } });
