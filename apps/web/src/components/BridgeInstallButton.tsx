import { Check, Download, LoaderCircle, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useEmbedBridge } from '../lib/embedBridge'
import { useI18n } from '../lib/i18n'

const CONFIRM_TIMEOUT_MS = 5000

/**
 * Two-step install button for the embedded store.
 *
 * The first click arms the button ("confirm install"); the second executes.
 * The confirmation lives here, in the page, because the local shell used to
 * pose it as a blocking `window.confirm` — a native dialog the host
 * environment can suppress or hide, which froze the whole install flow with
 * a spinner and no explanation. The armed state expires on its own so a
 * stray click never leaves a live trigger behind.
 */
export function BridgeInstallButton({
  pluginId,
  command,
  className = 'button button-primary',
  iconOnly = false,
}: {
  pluginId: string
  /** Full official install command; the local endpoint forwards it verbatim. */
  command?: string
  className?: string
  iconOnly?: boolean
}) {
  const { install, installedPluginIds } = useEmbedBridge()
  const { t } = useI18n()
  const [state, setState] = useState<'idle' | 'confirm' | 'installing' | 'installed' | 'failed'>('idle')
  const [error, setError] = useState('')
  const confirmTimerRef = useRef<number | null>(null)

  const alreadyInstalled = installedPluginIds?.includes(pluginId) === true

  useEffect(() => () => {
    if (confirmTimerRef.current !== null) window.clearTimeout(confirmTimerRef.current)
  }, [])

  async function onClick() {
    if (state === 'confirm') {
      if (confirmTimerRef.current !== null) window.clearTimeout(confirmTimerRef.current)
      confirmTimerRef.current = null
      setState('installing')
      setError('')
      try {
        const result = await install(pluginId, command)
        if (!result.ok) throw new Error(result.error || t('bridgeInstallFailed'))
        setState('installed')
      } catch (installError) {
        setError(installError instanceof Error ? installError.message : String(installError))
        setState('failed')
      }
      return
    }
    setState('confirm')
    confirmTimerRef.current = window.setTimeout(() => {
      confirmTimerRef.current = null
      setState((current) => current === 'confirm' ? 'idle' : current)
    }, CONFIRM_TIMEOUT_MS)
  }

  const label = state === 'installing'
    ? t('bridgeInstalling')
    : alreadyInstalled || state === 'installed'
      ? t('bridgeInstalled')
      : state === 'confirm'
        ? t('bridgeInstallConfirm')
        : state === 'failed'
          ? t('retry')
          : t('bridgeInstall')
  const Icon = state === 'installing'
    ? LoaderCircle
    : alreadyInstalled || state === 'installed'
      ? Check
      : state === 'confirm'
        ? ShieldCheck
        : Download

  return (
    <button
      type="button"
      className={`${className}${state === 'installing' ? ' is-busy' : ''}`}
      data-state={alreadyInstalled ? 'installed' : state}
      onClick={onClick}
      disabled={state === 'installing' || alreadyInstalled}
      aria-label={label}
      title={error || (state === 'confirm' && command) || label}
    >
      <Icon size={iconOnly ? 15 : 16} aria-hidden="true" />
      {!iconOnly && <span>{label}</span>}
    </button>
  )
}
