import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { isPluginsPage, type PluginsPage } from './api'

export const EMBED_BRIDGE_PROTOCOL = 'dsh1024-bridge'
export const EMBED_BRIDGE_VERSION = 1

export interface BridgeInstalledPlugin {
  id: string
  name: string
  owner: string
  url: string
  category: string
  categoryLabel: { en: string; zh: string }
  description: { en: string; zh: string }
  install: string
  added: string
  stars: number | null
}

interface BridgeResult {
  ok: boolean
  error?: string
  pluginIds?: string[]
  plugins?: BridgeInstalledPlugin[]
  catalogPage?: PluginsPage | null
}

interface PendingRequest {
  resolve: (value: BridgeResult) => void
  reject: (reason: Error) => void
  timer: number
}

interface EmbedBridgeValue {
  embedded: boolean
  connected: boolean
  activation: number
  installedPluginIds: string[] | null
  installedPlugins: BridgeInstalledPlugin[] | null
  installedError: string
  refreshInstalled: () => Promise<void>
  install: (pluginId: string, target?: string) => Promise<BridgeResult>
  readCatalogPageCache: () => Promise<PluginsPage | null>
  writeCatalogPageCache: (page: PluginsPage) => Promise<void>
}

const EmbedBridgeContext = createContext<EmbedBridgeValue>({
  embedded: false,
  connected: false,
  activation: 0,
  installedPluginIds: null,
  installedPlugins: null,
  installedError: '',
  refreshInstalled: async () => undefined,
  install: async () => ({ ok: false, error: 'Local DSH bridge is not connected.' }),
  readCatalogPageCache: async () => null,
  writeCatalogPageCache: async () => undefined,
})

function messageObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function bridgeInstalledPlugin(value: unknown): BridgeInstalledPlugin | null {
  const plugin = messageObject(value)
  const description = messageObject(plugin?.description)
  const categoryLabel = messageObject(plugin?.categoryLabel)
  if (plugin === null || typeof plugin.id !== 'string' || typeof plugin.name !== 'string'
    || typeof plugin.owner !== 'string' || typeof plugin.url !== 'string'
    || typeof plugin.category !== 'string' || typeof plugin.install !== 'string'
    || typeof plugin.added !== 'string'
    || (plugin.stars !== null && typeof plugin.stars !== 'number')
    || description === null || typeof description.en !== 'string' || typeof description.zh !== 'string'
    || categoryLabel === null || typeof categoryLabel.en !== 'string' || typeof categoryLabel.zh !== 'string') return null
  return {
    id: plugin.id,
    name: plugin.name,
    owner: plugin.owner,
    url: plugin.url,
    category: plugin.category,
    categoryLabel: { en: categoryLabel.en, zh: categoryLabel.zh },
    description: { en: description.en, zh: description.zh },
    install: plugin.install,
    added: plugin.added,
    stars: plugin.stars,
  }
}

function initialEmbeddedState(): boolean {
  if (typeof window === 'undefined') return false
  return window.self !== window.top || window.location.pathname.startsWith('/embed/')
}

export function EmbedBridgeProvider({ children }: { children: ReactNode }) {
  const [embedded] = useState(initialEmbeddedState)
  const [connected, setConnected] = useState(false)
  const [activation, setActivation] = useState(0)
  const [installedPluginIds, setInstalledPluginIds] = useState<string[] | null>(null)
  const [installedPlugins, setInstalledPlugins] = useState<BridgeInstalledPlugin[] | null>(null)
  const [installedError, setInstalledError] = useState('')
  const portRef = useRef<MessagePort | null>(null)
  const pendingRef = useRef(new Map<string, PendingRequest>())

  useEffect(() => {
    if (!embedded) return undefined
    document.documentElement.dataset.dsh1024Embed = 'true'
    return () => { delete document.documentElement.dataset.dsh1024Embed }
  }, [embedded])

  useEffect(() => {
    if (!embedded || typeof window === 'undefined') return undefined

    function disconnect(reason: string) {
      setConnected(false)
      portRef.current?.close()
      portRef.current = null
      for (const pending of pendingRef.current.values()) {
        window.clearTimeout(pending.timer)
        pending.reject(new Error(reason))
      }
      pendingRef.current.clear()
    }

    function onConnect(event: MessageEvent) {
      const message = messageObject(event.data)
      if (
        event.source !== window.parent
        || message?.protocol !== EMBED_BRIDGE_PROTOCOL
        || message.version !== EMBED_BRIDGE_VERSION
        || message.type !== 'connect'
        || event.ports.length !== 1
      ) return

      disconnect('Local DSH bridge reconnected.')
      const port = event.ports[0]!
      portRef.current = port
      port.onmessage = (portEvent) => {
        const payload = messageObject(portEvent.data)
        if (payload?.protocol === EMBED_BRIDGE_PROTOCOL
          && payload.version === EMBED_BRIDGE_VERSION
          && payload.type === 'activate') {
          setActivation(value => value + 1)
          return
        }
        if (payload?.type !== 'result' || typeof payload.requestId !== 'string') return
        const pending = pendingRef.current.get(payload.requestId)
        if (!pending) return
        pendingRef.current.delete(payload.requestId)
        window.clearTimeout(pending.timer)
        const ok = payload.ok === true
        const pluginIds = Array.isArray(payload.pluginIds)
          ? payload.pluginIds.filter((id): id is string => typeof id === 'string')
          : undefined
        const plugins = Array.isArray(payload.plugins)
          ? payload.plugins.flatMap(plugin => {
              const parsed = bridgeInstalledPlugin(plugin)
              return parsed === null ? [] : [parsed]
            })
          : undefined
        const catalogPage = payload.catalogPage === null
          ? null
          : isPluginsPage(payload.catalogPage) ? payload.catalogPage : undefined
        pending.resolve({
          ok,
          error: typeof payload.error === 'string' ? payload.error : undefined,
          pluginIds,
          plugins,
          catalogPage,
        })
      }
      port.onmessageerror = () => disconnect('Local DSH bridge sent an invalid message.')
      port.start()
      setConnected(true)
      port.postMessage({
        protocol: EMBED_BRIDGE_PROTOCOL,
        version: EMBED_BRIDGE_VERSION,
        type: 'ready',
        capabilities: ['install', 'installed', 'catalog-cache'],
      })
    }

    window.addEventListener('message', onConnect)
    // The local shell cannot know when React has installed this listener.
    // Announce readiness without transferring any capability; the parent then
    // validates this frame's source and origin before it sends a MessagePort.
    if (window.parent !== window) {
      window.parent.postMessage({
        protocol: EMBED_BRIDGE_PROTOCOL,
        version: EMBED_BRIDGE_VERSION,
        type: 'init',
      }, '*')
    }
    return () => {
      window.removeEventListener('message', onConnect)
      disconnect('Local DSH bridge closed.')
    }
  }, [embedded])

  const sendRequest = useCallback((
    action: 'install' | 'installed' | 'catalog-cache-read' | 'catalog-cache-write',
    options: { pluginId?: string; target?: string; catalogPage?: PluginsPage } = {},
  ): Promise<BridgeResult> => {
    const port = portRef.current
    if (port === null) {
      return Promise.resolve({ ok: false, error: 'Local DSH bridge is not connected.' })
    }
    const requestId = crypto.randomUUID()
    return new Promise<BridgeResult>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingRef.current.delete(requestId)
        reject(new Error(action === 'install' ? 'Local installation timed out.' : 'Local DSH bridge request timed out.'))
      }, 6 * 60 * 1000)
      pendingRef.current.set(requestId, { resolve, reject, timer })
      const message: Record<string, unknown> = {
        protocol: EMBED_BRIDGE_PROTOCOL,
        version: EMBED_BRIDGE_VERSION,
        type: 'request',
        requestId,
        action,
      }
      if (options.pluginId !== undefined) message.pluginId = options.pluginId
      if (options.target !== undefined) message.target = options.target
      if (options.catalogPage !== undefined) message.catalogPage = options.catalogPage
      port.postMessage(message)
    })
  }, [])

  const refreshInstalled = useCallback(async () => {
    setInstalledError('')
    try {
      const result = await sendRequest('installed')
      if (!result.ok || result.pluginIds === undefined || result.plugins === undefined) {
        throw new Error(result.error || 'Installed plugins are unavailable.')
      }
      setInstalledPluginIds([...new Set(result.pluginIds)].sort())
      setInstalledPlugins(result.plugins)
    } catch (error) {
      setInstalledError(error instanceof Error ? error.message : String(error))
    }
  }, [sendRequest])

  useEffect(() => {
    if (!connected) return
    void refreshInstalled()
  }, [connected, refreshInstalled])

  // The page names the npm target alongside the catalog id: the page and the
  // local endpoint read the same first-party catalog API, so the endpoint
  // executes the named package directly instead of re-fetching the registry
  // to re-derive it (issue #159's failure mode).
  const install = useCallback(async (pluginId: string, target?: string) => {
    const result = await sendRequest('install', { pluginId, target })
    if (result.ok) {
      setInstalledPluginIds((current) => [...new Set([...(current ?? []), pluginId])].sort())
      void refreshInstalled()
    }
    return result
  }, [refreshInstalled, sendRequest])

  const readCatalogPageCache = useCallback(async () => {
    const result = await sendRequest('catalog-cache-read')
    return result.ok ? result.catalogPage ?? null : null
  }, [sendRequest])

  const writeCatalogPageCache = useCallback(async (page: PluginsPage) => {
    const result = await sendRequest('catalog-cache-write', { catalogPage: page })
    if (!result.ok) throw new Error(result.error || 'Writing the local catalog cache failed.')
  }, [sendRequest])

  const value = useMemo(() => ({
    embedded,
    connected,
    activation,
    installedPluginIds,
    installedPlugins,
    installedError,
    refreshInstalled,
    install,
    readCatalogPageCache,
    writeCatalogPageCache,
  }), [activation, connected, embedded, install, installedError, installedPluginIds, installedPlugins, readCatalogPageCache, refreshInstalled, writeCatalogPageCache])
  return <EmbedBridgeContext.Provider value={value}>{children}</EmbedBridgeContext.Provider>
}

export function useEmbedBridge(): EmbedBridgeValue {
  return useContext(EmbedBridgeContext)
}
