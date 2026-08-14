import { DurableObject } from 'cloudflare:workers'
import type { LiveStatsPayload } from './types'

const VISIT_DEDUPE_MS = 60 * 60 * 1000
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000
const VISIT_ID = /^[A-Za-z0-9-]{16,80}$/

export class LiveStats extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS counters (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        views INTEGER NOT NULL DEFAULT 0
      );
      INSERT OR IGNORE INTO counters (id, views) VALUES (1, 0);
      CREATE TABLE IF NOT EXISTS recent_visits (
        visit_id TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS recent_visits_expiry ON recent_visits (expires_at);
    `)
  }

  private currentStats(): LiveStatsPayload {
    const row = this.ctx.storage.sql.exec<{ views: number }>(
      'SELECT views FROM counters WHERE id = 1',
    ).one()
    const online = this.ctx.getWebSockets().filter((socket) => socket.readyState === 1).length
    return {
      type: 'stats',
      views: row.views,
      online,
      updatedAt: new Date().toISOString(),
    }
  }

  private recordVisit(visitId: string): void {
    const inserted = this.ctx.storage.sql.exec(
      'INSERT OR IGNORE INTO recent_visits (visit_id, expires_at) VALUES (?, ?)',
      visitId,
      Date.now() + VISIT_DEDUPE_MS,
    ).rowsWritten
    if (inserted > 0) {
      this.ctx.storage.sql.exec('UPDATE counters SET views = views + 1 WHERE id = 1')
    }
  }

  private broadcast(): void {
    const message = JSON.stringify(this.currentStats())
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(message)
      } catch {
        try {
          socket.close(1011, 'Unable to deliver live stats')
        } catch {
          // The socket is already closed.
        }
      }
    }
  }

  private async ensureCleanupAlarm(): Promise<void> {
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + CLEANUP_INTERVAL_MS)
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLocaleLowerCase() !== 'websocket') {
      return Response.json({ error: 'Expected a WebSocket upgrade.' }, { status: 426 })
    }

    const visitId = new URL(request.url).searchParams.get('visit') ?? ''
    if (!VISIT_ID.test(visitId)) {
      return Response.json({ error: 'Invalid visit identifier.' }, { status: 400 })
    }

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    server.serializeAttachment({ visitId, connectedAt: Date.now() })
    this.ctx.acceptWebSocket(server)
    this.recordVisit(visitId)
    await this.ensureCleanupAlarm()
    this.broadcast()

    return new Response(null, { status: 101, webSocket: client })
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    if (message === 'ping') socket.send(JSON.stringify(this.currentStats()))
  }

  webSocketClose(_socket: WebSocket, _code: number, _reason: string, _wasClean: boolean): void {
    this.broadcast()
  }

  webSocketError(_socket: WebSocket, error: unknown): void {
    console.error(
      JSON.stringify({
        message: 'live_stats_websocket_error',
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    this.broadcast()
  }

  async alarm(): Promise<void> {
    this.ctx.storage.sql.exec('DELETE FROM recent_visits WHERE expires_at <= ?', Date.now())
    const next = this.ctx.storage.sql.exec<{ expiresAt: number | null }>(
      'SELECT MIN(expires_at) AS expiresAt FROM recent_visits',
    ).one()
    if (next.expiresAt !== null) {
      await this.ctx.storage.setAlarm(Math.max(next.expiresAt, Date.now() + 1000))
    }
  }
}
