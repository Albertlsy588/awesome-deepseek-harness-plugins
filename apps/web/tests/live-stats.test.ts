import { describe, expect, it } from 'vitest'
import {
  HEARTBEAT_TIMEOUT_MS,
  partitionConnections,
  summarizeConnections,
} from '../worker/lib/live-connections'

const NOW = 1_760_000_000_000

function connection(id: string, visitId: string, lastSeenAt: number) {
  return { socket: id, state: { visitId, lastSeenAt } }
}

describe('live connection accounting', () => {
  it('counts each visitor once regardless of how many tabs they open', () => {
    const result = partitionConnections(
      [
        connection('tab-a', 'visitor-1', NOW),
        connection('tab-b', 'visitor-1', NOW),
        connection('tab-c', 'visitor-1', NOW),
        connection('tab-d', 'visitor-2', NOW),
      ],
      NOW,
    )

    expect(result.online).toBe(2)
    expect(result.stale).toEqual([])
  })

  it('drops connections that stopped sending heartbeats', () => {
    const result = partitionConnections(
      [
        connection('fresh', 'visitor-1', NOW - 1_000),
        connection('zombie', 'visitor-2', NOW - HEARTBEAT_TIMEOUT_MS - 1),
      ],
      NOW,
    )

    expect(result.online).toBe(1)
    expect(result.stale).toEqual(['zombie'])
  })

  it('keeps a visitor online while any of their connections still beats', () => {
    const result = partitionConnections(
      [
        connection('backgrounded', 'visitor-1', NOW - HEARTBEAT_TIMEOUT_MS - 1),
        connection('foreground', 'visitor-1', NOW),
      ],
      NOW,
    )

    expect(result.online).toBe(1)
    expect(result.stale).toEqual(['backgrounded'])
  })

  it('treats a connection that never answered a heartbeat as live until it times out', () => {
    const result = partitionConnections(
      [
        connection('just-connected', 'visitor-1', NOW - HEARTBEAT_TIMEOUT_MS + 1_000),
        connection('never-answered', 'visitor-2', NOW - HEARTBEAT_TIMEOUT_MS - 1_000),
      ],
      NOW,
    )

    expect(result.online).toBe(1)
    expect(result.stale).toEqual(['never-answered'])
  })

  it('ignores connections without a usable visitor identity', () => {
    const result = partitionConnections([connection('anonymous', '', NOW)], NOW)

    expect(result.online).toBe(0)
    expect(result.stale).toEqual(['anonymous'])
  })
})

describe('connection snapshot', () => {
  it('separates visitors from sockets and reports no identifiers', () => {
    const snapshot = summarizeConnections(
      [
        { visitId: 'v1', lastBeatAt: NOW - 5_000, connectedAt: NOW - 600_000 },
        { visitId: 'v1', lastBeatAt: NOW - 3_000, connectedAt: NOW - 300_000 },
        { visitId: 'v2', lastBeatAt: NOW - 40_000, connectedAt: NOW - 60_000 },
        { visitId: 'v3', lastBeatAt: null, connectedAt: NOW - 1_000 },
      ],
      NOW,
      2,
    )

    expect(snapshot.sockets).toBe(4)
    expect(snapshot.visitors).toBe(3)
    expect(snapshot.visitorsWithExtraSockets).toBe(1)
    expect(snapshot.neverBeat).toBe(1)
    expect(snapshot.evicted).toBe(2)
    expect(snapshot.heartbeatAgeSeconds?.max).toBe(40)
    expect(snapshot.connectionAgeSeconds?.max).toBe(600)
    expect(JSON.stringify(snapshot)).not.toContain('v1')
  })

  it('reports empty spreads when nothing is connected', () => {
    const snapshot = summarizeConnections([], NOW, 0)
    expect(snapshot).toMatchObject({ sockets: 0, visitors: 0, heartbeatAgeSeconds: null })
  })
})
