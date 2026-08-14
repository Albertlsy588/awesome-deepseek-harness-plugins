import { useEffect, useState } from 'react'
import type { LiveStats } from './api'

interface LiveStatsState {
  stats: LiveStats | null
  connected: boolean
}

let pageVisitId: string | undefined

function visitId(): string {
  pageVisitId ??= crypto.randomUUID()
  return pageVisitId
}

function isLiveStats(value: unknown): value is LiveStats {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<LiveStats>
  return (
    candidate.type === 'stats' &&
    typeof candidate.views === 'number' &&
    typeof candidate.online === 'number' &&
    typeof candidate.updatedAt === 'string'
  )
}

export function useLiveStats(): LiveStatsState {
  const [state, setState] = useState<LiveStatsState>({ stats: null, connected: false })

  useEffect(() => {
    let socket: WebSocket | undefined
    let reconnectTimer: number | undefined
    let heartbeatTimer: number | undefined
    let stopped = false
    let attempt = 0

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      socket = new WebSocket(`${protocol}//${window.location.host}/api/live?visit=${visitId()}`)
      socket.addEventListener('open', () => {
        attempt = 0
        setState((current) => ({ ...current, connected: true }))
        heartbeatTimer = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) socket.send('ping')
        }, 25_000)
      })
      socket.addEventListener('message', (event) => {
        try {
          const payload: unknown = JSON.parse(String(event.data))
          if (isLiveStats(payload)) setState({ stats: payload, connected: true })
        } catch {
          // Ignore malformed frames and retain the last valid snapshot.
        }
      })
      socket.addEventListener('close', () => {
        if (heartbeatTimer !== undefined) window.clearInterval(heartbeatTimer)
        setState((current) => ({ ...current, connected: false }))
        if (!stopped) {
          const delay = Math.min(30_000, 1_000 * 2 ** attempt)
          attempt += 1
          reconnectTimer = window.setTimeout(connect, delay)
        }
      })
      socket.addEventListener('error', () => socket?.close())
    }

    connect()
    return () => {
      stopped = true
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer)
      if (heartbeatTimer !== undefined) window.clearInterval(heartbeatTimer)
      socket?.close(1000, 'Page closed')
    }
  }, [])

  return state
}
