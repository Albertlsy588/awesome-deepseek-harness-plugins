/**
 * Browsers cannot emit WebSocket control frames, so liveness relies on the
 * application level heartbeat the client sends every 25 seconds. Allow three
 * missed beats before a connection is treated as gone: anything that vanished
 * without a close frame (backgrounded tab, dropped network, killed process)
 * would otherwise be counted forever.
 */
export const HEARTBEAT_TIMEOUT_MS = 90_000

export interface LiveConnectionState {
  visitId: string
  lastSeenAt: number
}

export interface LiveConnection<Socket> {
  socket: Socket
  state: LiveConnectionState
}

export interface LiveConnectionPartition<Socket> {
  online: number
  stale: Socket[]
}

/** Counts distinct visitors that still beat, and reports the sockets to evict. */
export function partitionConnections<Socket>(
  connections: Array<LiveConnection<Socket>>,
  now: number,
): LiveConnectionPartition<Socket> {
  const visitors = new Set<string>()
  const stale: Socket[] = []

  for (const { socket, state } of connections) {
    if (state.visitId && now - state.lastSeenAt <= HEARTBEAT_TIMEOUT_MS) {
      visitors.add(state.visitId)
    } else {
      stale.push(socket)
    }
  }

  return { online: visitors.size, stale }
}

export interface AgeSpread {
  p50: number
  p90: number
  max: number
}

export interface ConnectionSnapshot {
  sockets: number
  visitors: number
  visitorsWithExtraSockets: number
  neverBeat: number
  evicted: number
  heartbeatAgeSeconds: AgeSpread | null
  connectionAgeSeconds: AgeSpread | null
}

function spread(values: number[]): AgeSpread | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
  return { p50: at(0.5), p90: at(0.9), max: sorted[sorted.length - 1] }
}

/**
 * Aggregate-only view of who is currently connected. Reports no visitor
 * identifiers, so it is safe to emit to logs.
 */
export function summarizeConnections(
  connections: Array<{ visitId: string; lastBeatAt: number | null; connectedAt: number | null }>,
  now: number,
  evicted: number,
): ConnectionSnapshot {
  const socketsPerVisitor = new Map<string, number>()
  const heartbeatAges: number[] = []
  const connectionAges: number[] = []
  let neverBeat = 0

  for (const { visitId, lastBeatAt, connectedAt } of connections) {
    socketsPerVisitor.set(visitId, (socketsPerVisitor.get(visitId) ?? 0) + 1)
    if (lastBeatAt === null) neverBeat += 1
    else heartbeatAges.push(Math.round((now - lastBeatAt) / 1000))
    if (connectedAt !== null) connectionAges.push(Math.round((now - connectedAt) / 1000))
  }

  let visitorsWithExtraSockets = 0
  for (const count of socketsPerVisitor.values()) {
    if (count > 1) visitorsWithExtraSockets += 1
  }

  return {
    sockets: connections.length,
    visitors: socketsPerVisitor.size,
    visitorsWithExtraSockets,
    neverBeat,
    evicted,
    heartbeatAgeSeconds: spread(heartbeatAges),
    connectionAgeSeconds: spread(connectionAges),
  }
}
