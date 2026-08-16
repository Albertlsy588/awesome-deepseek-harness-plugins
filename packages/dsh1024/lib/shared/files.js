/** Shared filesystem primitives for the 1024 Store state directory (locked, atomic). */
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { mkdir, open, readdir, readFile, rename, rmdir, stat, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
const LOCK_WAIT_TIMEOUT_MS = 30_000;
const EMPTY_LOCK_STALE_MS = 1_000;
function errno(error) {
    return error?.code;
}
export function resolveDshHome(env = process.env) {
    return resolve(env.DSH_HOME || join(homedir(), '.dsh'));
}
export function storePaths(dshHome) {
    const directory = join(dshHome, '.dsh-1024store');
    return {
        directory,
        client: join(directory, 'client.json'),
        pending: join(directory, 'pending.json'),
        receipts: join(directory, 'receipts.json'),
    };
}
export async function readJson(path, fallback = null) {
    try {
        return JSON.parse(await readFile(path, 'utf8'));
    }
    catch (error) {
        if (errno(error) === 'ENOENT')
            return fallback;
        throw error;
    }
}
export async function writeJsonAtomic(path, value) {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
    const handle = await open(temporary, 'wx', 0o600);
    try {
        await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    }
    finally {
        await handle.close();
    }
    await rename(temporary, path);
}
export async function withFileLock(path, callback, options = {}) {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const lockDirectory = `${path}.lock`;
    const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;
    let ownerPath;
    while (true) {
        try {
            await mkdir(lockDirectory, { mode: 0o700 });
        }
        catch (error) {
            if (errno(error) !== 'EEXIST')
                throw error;
            if (!await removeStaleLock(lockDirectory)) {
                if (Date.now() >= deadline)
                    throw new Error(`timed out waiting for file lock: ${path}`);
                await delay(10 + Math.floor(Math.random() * 20));
            }
            continue;
        }
        const candidate = join(lockDirectory, `${randomUUID()}.owner`);
        if (await installOwner(lockDirectory, candidate, options)) {
            ownerPath = candidate;
            break;
        }
        if (Date.now() >= deadline)
            throw new Error(`timed out acquiring file lock: ${path}`);
        await delay(10 + Math.floor(Math.random() * 20));
    }
    try {
        return await callback();
    }
    finally {
        await releaseOwnedLock(lockDirectory, ownerPath);
    }
}
async function installOwner(lockDirectory, ownerPath, options) {
    const temporaryOwner = `${lockDirectory}.${randomUUID()}.owner.tmp`;
    let handle;
    try {
        handle = await open(temporaryOwner, 'wx', 0o600);
        try {
            await handle.writeFile(`${JSON.stringify({
                pid: process.pid,
                createdAt: new Date().toISOString(),
            })}\n`);
        }
        finally {
            await handle.close();
            handle = undefined;
        }
        if (typeof options.beforeOwnerCommit === 'function')
            await options.beforeOwnerCommit();
        await rename(temporaryOwner, ownerPath);
    }
    catch (error) {
        await handle?.close().catch(() => { });
        await unlinkIfPresent(temporaryOwner).catch(() => { });
        await releaseOwnedLock(lockDirectory, ownerPath).catch(() => { });
        if (errno(error) === 'ENOENT')
            return false;
        throw error;
    }
    try {
        const owners = (await readdir(lockDirectory, { withFileTypes: true }))
            .filter((entry) => entry.isFile() && entry.name.endsWith('.owner'));
        if (owners.length === 1 && join(lockDirectory, owners[0].name) === ownerPath)
            return true;
    }
    catch (error) {
        if (errno(error) !== 'ENOENT')
            throw error;
    }
    await releaseOwnedLock(lockDirectory, ownerPath);
    return false;
}
async function removeStaleLock(lockDirectory) {
    let entries;
    try {
        entries = await readdir(lockDirectory, { withFileTypes: true });
    }
    catch (error) {
        if (errno(error) === 'ENOENT')
            return true;
        throw error;
    }
    const owners = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.owner'));
    if (owners.length === 0) {
        try {
            const metadata = await stat(lockDirectory);
            if (Date.now() - metadata.mtimeMs < EMPTY_LOCK_STALE_MS)
                return false;
            await rmdir(lockDirectory);
            return true;
        }
        catch (error) {
            if (errno(error) === 'ENOENT')
                return true;
            if (isTransientRemovalError(error))
                return false;
            throw error;
        }
    }
    const ownerPaths = owners.map((entry) => join(lockDirectory, entry.name));
    const staleStates = await Promise.all(ownerPaths.map(ownerIsStale));
    if (staleStates.some((state) => state !== true))
        return false;
    for (const ownerPath of ownerPaths) {
        try {
            await unlink(ownerPath);
        }
        catch (error) {
            if (errno(error) === 'ENOENT')
                return false;
            throw error;
        }
    }
    try {
        await rmdir(lockDirectory);
        return true;
    }
    catch (error) {
        if (errno(error) === 'ENOENT')
            return true;
        if (isTransientRemovalError(error))
            return false;
        throw error;
    }
}
// Windows can transiently refuse to remove a directory whose entries were just
// unlinked (open handles, antivirus scans). Treat those refusals like "lock is
// still busy" instead of crashing; acquisition already handles leftover empty
// lock directories via the stale-lock path.
function isTransientRemovalError(error) {
    const code = errno(error);
    return code === 'ENOTEMPTY' || code === 'EEXIST' || code === 'EPERM' || code === 'EBUSY';
}
async function ownerIsStale(ownerPath) {
    let metadata;
    let owner;
    try {
        [metadata, owner] = await Promise.all([
            stat(ownerPath),
            readFile(ownerPath, 'utf8').then((content) => JSON.parse(content)).catch(() => null),
        ]);
    }
    catch (error) {
        if (errno(error) === 'ENOENT')
            return null;
        throw error;
    }
    const pid = owner?.pid;
    if (Number.isInteger(pid) && pid > 0) {
        try {
            process.kill(pid, 0);
            return false;
        }
        catch (error) {
            if (errno(error) === 'ESRCH' || errno(error) === 'EINVAL')
                return true;
            return false;
        }
    }
    return Date.now() - metadata.mtimeMs >= EMPTY_LOCK_STALE_MS;
}
async function releaseOwnedLock(lockDirectory, ownerPath) {
    try {
        await unlink(ownerPath);
    }
    catch (error) {
        if (errno(error) === 'ENOENT')
            return;
        throw error;
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
            await rmdir(lockDirectory);
            return;
        }
        catch (error) {
            if (errno(error) === 'ENOENT')
                return;
            if (!isTransientRemovalError(error))
                throw error;
            await delay(20 * (attempt + 1));
        }
    }
}
export async function unlinkIfPresent(path) {
    try {
        await unlink(path);
        return true;
    }
    catch (error) {
        if (errno(error) === 'ENOENT')
            return false;
        throw error;
    }
}
