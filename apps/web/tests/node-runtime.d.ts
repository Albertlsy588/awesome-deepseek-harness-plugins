declare module 'node:fs' {
  export function readFileSync(path: URL, encoding: 'utf8'): string
}

declare module 'node:sqlite' {
  interface StatementSync {
    all(...params: unknown[]): Array<Record<string, unknown>>
    get(...params: unknown[]): Record<string, unknown> | undefined
    run(...params: unknown[]): { changes: number | bigint }
  }

  export class DatabaseSync {
    constructor(path: string)
    exec(sql: string): void
    prepare(sql: string): StatementSync
    close(): void
  }
}

interface ImportMeta {
  readonly url: string
}
