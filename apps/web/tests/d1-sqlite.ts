import type { DatabaseSync } from 'node:sqlite'
import { migratedDatabase } from '@dsh-1024store/core/testing/d1'

export { sqliteD1 } from '@dsh-1024store/core/testing/d1'

/** In-memory database with the real 0004_api_accounts.sql migration applied. */
export function accountsDatabase(): DatabaseSync {
  return migratedDatabase(new URL('../migrations/0004_api_accounts.sql', import.meta.url))
}
