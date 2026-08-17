import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api, type Session, type Viewer } from './api'

interface SessionValue {
  viewer: Viewer | null
  loading: boolean
  /** Absolute URL of the main site's GitHub sign-in, carrying a return address. */
  signInUrl: string | null
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api.session()
      .then((next) => { if (!cancelled) setSession(next) })
      .catch(() => { if (!cancelled) setSession({ viewer: null, signInUrl: null }) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const signOut = useCallback(async () => {
    await api.signOut().catch(() => undefined)
    // Refetch rather than assume: sign-out also has to reflect a session that
    // expired or was revoked from the main site.
    setSession(await api.session().catch(() => ({ viewer: null, signInUrl: null })))
  }, [])

  const value = useMemo<SessionValue>(() => ({
    viewer: session?.viewer ?? null,
    signInUrl: session?.signInUrl ?? null,
    loading,
    signOut,
  }), [loading, session, signOut])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession used outside SessionProvider')
  return value
}

/**
 * Send the reader to GitHub, coming back to where they were.
 *
 * The current path is passed to the Worker rather than to the main site
 * directly, so the allow-list of return hosts stays server-side.
 */
export function startSignIn(): void {
  const returnTo = `${window.location.pathname}${window.location.search}`
  window.location.href = `/api/v1/community/sign-in?returnTo=${encodeURIComponent(returnTo)}`
}
