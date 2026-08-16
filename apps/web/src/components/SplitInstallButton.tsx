import { Check, ChevronDown, Copy } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  officialInstallCommand,
  officialNpxInstallCommand,
  trackedInstallCommand,
  type RegistryPlugin,
} from '../lib/api'
import { useI18n } from '../lib/i18n'

type Kind = 'tracked' | 'official' | 'officialNpx'

export function SplitInstallButton({ plugin }: { plugin: Pick<RegistryPlugin, 'owner' | 'name' | 'url'> }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<Kind | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    if (!copied) return
    const timeout = window.setTimeout(() => setCopied(null), 1800)
    return () => window.clearTimeout(timeout)
  }, [copied])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  async function copy(kind: Kind) {
    const command = kind === 'tracked'
      ? trackedInstallCommand(plugin)
      : kind === 'official'
        ? officialInstallCommand(plugin)
        : officialNpxInstallCommand(plugin)
    await navigator.clipboard.writeText(command)
    setCopied(kind)
    setOpen(false)
  }

  function onMenuKeyDown(event: ReactKeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[]
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length
    items[next]?.focus()
  }

  return (
    <div className="split-install" ref={rootRef}>
      <button
        type="button"
        className="split-install-main icon-button"
        onClick={() => copy('tracked')}
        aria-label={copied === 'tracked' ? t('copied') : t('copyRecommendedCommand')}
        title={copied === 'tracked' ? t('copied') : t('copyRecommendedCommand')}
      >
        {copied === 'tracked' ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
      </button>
      <button
        type="button"
        ref={toggleRef}
        className="split-install-toggle icon-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('installOptionsMenu')}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault()
            setOpen(true)
            window.setTimeout(() => itemRefs.current[0]?.focus(), 0)
          }
        }}
      >
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && (
        <div className="split-install-menu" role="menu" aria-label={t('installOptionsMenu')} onKeyDown={onMenuKeyDown}>
          <button type="button" role="menuitem" ref={(el) => { itemRefs.current[0] = el }} onClick={() => copy('tracked')}>
            <span className="split-menu-badge">{t('recommendedInstall')}</span>
            <code>{trackedInstallCommand(plugin)}</code>
            {copied === 'tracked' ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          </button>
          <button type="button" role="menuitem" ref={(el) => { itemRefs.current[1] = el }} onClick={() => copy('official')}>
            <span className="split-menu-label">{t('officialCliCommand')}</span>
            <code>{officialInstallCommand(plugin)}</code>
            {copied === 'official' ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          </button>
          <button type="button" role="menuitem" ref={(el) => { itemRefs.current[2] = el }} onClick={() => copy('officialNpx')}>
            <span className="split-menu-label">{t('officialNpxCommand')}</span>
            <code>{officialNpxInstallCommand(plugin)}</code>
            {copied === 'officialNpx' ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          </button>
        </div>
      )}
    </div>
  )
}
