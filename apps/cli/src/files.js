import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { mkdir, open, readdir, readFile, rename, rmdir, stat, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'

const LOCK_WAIT_TIMEOUT_MS = 30_000
const EMPTY_LOCK_STALE_MS = 1_000

export function resolveDshHome(env = process.env) {
  return resolve(env.DSH_HOME || join(homedir(), '.dsh'))
}

export function storePaths(dshHome) {
  const directory = join(dshHome, '.dsh-1024store')
  return {
    directory,
    client: join(directory, 'client.json'),
    pending: join(directory, 'pending.json'),
    receipts: join(directory, 'receipts.json'),
  }
}

export async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    throw error
  }
}

export async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  const handle = await open(temporary, 'wx', 0o600)
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8')
  } finally {
    await handle.close()
  }
  await rename(temporary, path)
}

export async function withFileLock(path, callback, options = {}) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const lockDirectory = `${path}.lock`
  const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS
  let ownerPath
  let lastCreationError

  while (true) {
    try {
      await mkdir(lockDirectory, { mode: 0o700 })
    } catch (error) {
      if (!isTransientCreationError(error)) throw error
      lastCreationError = error
      // EEXIST means the directory is genuinely there, so it may be a stale lock
      // worth reaping. The Windows race codes mean the create itself was refused
      // and there is nothing to inspect yet — just back off and try again.
      if (error.code !== 'EEXIST' || !await removeStaleLock(lockDirectory)) {
        if (Date.now() >= deadline) {
          throw new Error(`timed out waiting for file lock: ${path} (last ${lastCreationError.code})`)
        }
        await delay(10 + Math.floor(Math.random() * 20))
      }
      continue
    }

    const candidate = join(lockDirectory, `${randomUUID()}.owner`)
    if (await installOwner(lockDirectory, candidate, options)) {
      ownerPath = candidate
      break
    }
    if (Date.now() >= deadline) throw new Error(`timed out acquiring file lock: ${path}`)
    await delay(10 + Math.floor(Math.random() * 20))
  }

  try {
    return await callback()
  } finally {
    await releaseOwnedLock(lockDirectory, ownerPath)
  }
}

async function installOwner(lockDirectory, ownerPath, options) {
  const temporaryOwner = `${lockDirectory}.${randomUUID()}.owner.tmp`
  let handle
  try {
    handle = await open(temporaryOwner, 'wx', 0o600)
    try {
      await handle.writeFile(`${JSON.stringify({
        pid: process.pid,
        createdAt: new Date().toISOString(),
      })}\n`)
    } finally {
      await handle.close()
      handle = undefined
    }
    if (typeof options.beforeOwnerCommit === 'function') await options.beforeOwnerCommit()
    await rename(temporaryOwner, ownerPath)
  } catch (error) {
    await handle?.close().catch(() => {})
    await unlinkIfPresent(temporaryOwner).catch(() => {})
    await releaseOwnedLock(lockDirectory, ownerPath).catch(() => {})
    if (error?.code === 'ENOENT' || isLockRaceError(error)) return false
    throw error
  }

  try {
    const owners = (await readdir(lockDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith('.owner'))
    if (owners.length === 1 && join(lockDirectory, owners[0].name) === ownerPath) return true
  } catch (error) {
    // Could not confirm sole ownership; fall through and yield the lock.
    if (error?.code !== 'ENOENT' && !isLockRaceError(error)) throw error
  }

  await releaseOwnedLock(lockDirectory, ownerPath)
  return false
}

async function removeStaleLock(lockDirectory) {
  let entries
  try {
    entries = await readdir(lockDirectory, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return true
    if (isLockRaceError(error)) return false
    throw error
  }

  const owners = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.owner'))
  if (owners.length === 0) {
    try {
      const metadata = await stat(lockDirectory)
      if (Date.now() - metadata.mtimeMs < EMPTY_LOCK_STALE_MS) return false
      await rmdir(lockDirectory)
      return true
    } catch (error) {
      if (error?.code === 'ENOENT') return true
      if (isTransientRemovalError(error)) return false
      throw error
    }
  }

  const ownerPaths = owners.map((entry) => join(lockDirectory, entry.name))
  const staleStates = await Promise.all(ownerPaths.map(ownerIsStale))
  if (staleStates.some((state) => state !== true)) return false

  for (const ownerPath of ownerPaths) {
    try {
      await unlink(ownerPath)
    } catch (error) {
      if (error?.code === 'ENOENT') return false
      if (isLockRaceError(error)) return false
      throw error
    }
  }

  try {
    await rmdir(lockDirectory)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return true
    if (isTransientRemovalError(error)) return false
    throw error
  }
}

// Windows reports a lock path that is racing another process as EPERM/EBUSY
// from whichever syscall touched it — mkdir, readdir, stat, unlink, rmdir or
// rename alike — where POSIX would report ENOENT or EEXIST. The usual cause is
// a directory still in a pending-delete state because its previous owner just
// released it; open handles and antivirus scans do the same. Every operation on
// a lock therefore has to read these as "busy, look again" rather than as a
// hard failure. A genuine permission problem still surfaces: acquisition
// exhausts its wait and the timeout message carries the underlying code.
function isLockRaceError(error) {
  return error?.code === 'EPERM' || error?.code === 'EBUSY'
}

function isTransientRemovalError(error) {
  return error?.code === 'ENOTEMPTY' || error?.code === 'EEXIST' || isLockRaceError(error)
}

function isTransientCreationError(error) {
  return error?.code === 'EEXIST' || isLockRaceError(error)
}

// The mirror image on the acquisition side. POSIX reports a contended lock
// directory as EEXIST, but Windows reports EPERM/EBUSY when the create races
// another process — most often when the name is still in a pending-delete state
// because the previous owner just released it. Those are contention, not
// failure, so they wait like EEXIST rather than crashing the caller. A genuine
// permission problem still surfaces: it exhausts the wait and the timeout
// message carries the underlying code.
function isTransientCreationError(error) {
  return error?.code === 'EEXIST' || error?.code === 'EPERM' || error?.code === 'EBUSY'
}

async function ownerIsStale(ownerPath) {
  let metadata
  let owner
  try {
    [metadata, owner] = await Promise.all([
      stat(ownerPath),
      readFile(ownerPath, 'utf8').then(JSON.parse).catch(() => null),
    ])
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    // Staleness is indeterminable while the path is contended; treat the lock
    // as live so nobody reaps an owner that may still be running.
    if (isLockRaceError(error)) return null
    throw error
  }

  if (Number.isInteger(owner?.pid) && owner.pid > 0) {
    try {
      process.kill(owner.pid, 0)
      return false
    } catch (error) {
      if (error?.code === 'ESRCH' || error?.code === 'EINVAL') return true
      return false
    }
  }
  return Date.now() - metadata.mtimeMs >= EMPTY_LOCK_STALE_MS
}

async function releaseOwnedLock(lockDirectory, ownerPath) {
  try {
    await unlink(ownerPath)
  } catch (error) {
    if (error?.code === 'ENOENT') return
    // This runs from withFileLock's finally, so throwing would replace the
    // caller's own result with a teardown error. Fall through to the rmdir
    // retries; anything left behind is reaped by the stale-lock path.
    if (!isLockRaceError(error)) throw error
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rmdir(lockDirectory)
      return
    } catch (error) {
      if (error?.code === 'ENOENT') return
      if (!isTransientRemovalError(error)) throw error
      await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)))
    }
  }
}

export async function unlinkIfPresent(path) {
  try {
    await unlink(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}
