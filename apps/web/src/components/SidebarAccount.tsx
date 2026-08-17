import { useEffect, useState } from 'react'
import { KeyRound, LogOut, MessageSquare, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import { useViewer } from '../lib/useViewer'

/**
 * The signed-in identity, pinned to the foot of the sidebar.
 *
 * Signed out it is a single button; signed in it is the entry to everything
 * that belongs to a person rather than to a page — their posts, their API keys,
 * signing out. Those used to be scattered: API keys only reachable from
 * `/account`, sign-out only from inside the community.
 */
export function SidebarAccount() {
  const { t } = useI18n()
  const { viewer, loading, signOut } = useViewer()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('click', close)
    window.addEventListener('keydown', onEscape)
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', onEscape)
    }
  }, [open])

  // A placeholder rather than the signed-out button: flashing "sign in" at
  // somebody who is already signed in, then swapping it, reads as a glitch.
  if (loading) return <span className="sidebar-account-placeholder" aria-hidden="true" />

  if (!viewer) {
    return (
      <a className="button button-primary sidebar-signin" href="/api/v1/auth/github/login?returnTo=/account">
        <UserRound size={15} aria-hidden="true" />
        {t('signIn')}
      </a>
    )
  }

  return (
    <div className="sidebar-account" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="sidebar-account-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        {viewer.avatarUrl
          ? <img className="sidebar-avatar" src={viewer.avatarUrl} alt="" width={26} height={26} />
          : <span className="sidebar-avatar is-fallback" aria-hidden="true">
              {viewer.githubLogin.slice(0, 1).toLocaleUpperCase()}
            </span>}
        <span className="sidebar-account-name">@{viewer.githubLogin}</span>
        <span className="sidebar-account-caret" aria-hidden="true">▾</span>
      </button>

      {open ? (
        <div className="sidebar-account-menu" role="menu">
          <Link to={`/community/u/${viewer.githubLogin}`} role="menuitem" onClick={() => setOpen(false)}>
            <MessageSquare size={14} aria-hidden="true" />
            {t('myPosts')}
          </Link>
          <Link to="/account" role="menuitem" onClick={() => setOpen(false)}>
            <KeyRound size={14} aria-hidden="true" />
            {t('apiKeys')}
          </Link>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); void signOut() }}>
            <LogOut size={14} aria-hidden="true" />
            {t('signOut')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
