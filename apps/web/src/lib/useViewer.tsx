import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getAuthUser, logoutUser, type AuthUser } from './api'

interface ViewerValue {
  viewer: AuthUser | null
  loading: boolean
  signOut: () => Promise<void>
}

const ViewerContext = createContext<ViewerValue | null>(null)

/**
 * Who is signed in, resolved once for the whole site.
 *
 * The sidebar shows it on every page and the community needs it for posting.
 * Before this there were two independent fetches of two different endpoints —
 * `/api/v1/auth/me` for the account page and `/api/v1/community/me` for the
 * community — which meant two requests on a community page and two answers that
 * could disagree while one was still in flight. One session, one source.
 */
export function ViewerProvider({ children }: { children: ReactNode }) {
  const [viewer, setViewer] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    getAuthUser(controller.signal)
      .then(setViewer)
      .catch(() => setViewer(null))
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  const signOut = useCallback(async () => {
    await logoutUser().catch(() => undefined)
    // Re-read rather than assume: sign-out also has to reflect a session that
    // expired or was revoked elsewhere.
    setViewer(await getAuthUser().catch(() => null))
  }, [])

  const value = useMemo<ViewerValue>(() => ({ viewer, loading, signOut }), [viewer, loading, signOut])
  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>
}

export function useViewer(): ViewerValue {
  const value = useContext(ViewerContext)
  if (!value) throw new Error('useViewer used outside ViewerProvider')
  return value
}
