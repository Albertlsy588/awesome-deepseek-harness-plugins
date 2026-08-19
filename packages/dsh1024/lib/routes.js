/** Local HTTP routes for browsing and managing 1024 Store plugins. */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { installExtraArgs, installTarget, loadRegistry } from './registry.js';
import { runPluginCommand } from './shared/install-runner.js';
import { reportInstallEvent } from './telemetry.js';
import { checkForUpdate } from './update.js';
const PROFILE_RE = /^[A-Za-z0-9_-]+$/;
const PACKAGE_RE = /^(?:@[a-z0-9._-]+\/)?[A-Za-z0-9._-]+$/;
const COMMAND_TIMEOUT_MS = 5 * 60 * 1000;
const BODY_LIMIT_BYTES = 4 * 1024;
function profileDirectory(profile) {
    return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'profiles', profile);
}
/**
 * Read non-official dependencies installed into one profile.
 * @param profile - validated profile name.
 * @returns package names mapped to their manifest specs.
 */
export function readInstalled(profile) {
    try {
        const manifest = JSON.parse(readFileSync(join(profileDirectory(profile), 'package.json'), 'utf8'));
        return Object.fromEntries(Object.entries(manifest.dependencies ?? {}).filter(([name]) => !name.startsWith('@deepseek-ai/')));
    }
    catch {
        return {};
    }
}
function cliInvocation() {
    const entry = process.argv[1];
    if (entry !== undefined && /[\\/](?:bin\.(?:js|ts)|dsh)$/.test(entry)) {
        const absoluteEntry = resolve(entry);
        return {
            file: process.execPath,
            prefixArgs: [...process.execArgv, absoluteEntry],
            cwd: dirname(absoluteEntry),
            useShell: false,
        };
    }
    return { file: 'dsh', prefixArgs: [], useShell: process.platform === 'win32' };
}
function failureCode(result) {
    if (result.timedOut)
        return 'TIMED_OUT';
    if (result.exitCode === 127)
        return 'SPAWN_FAILED';
    return 'OFFICIAL_CLI_FAILED';
}
function pluginEventId(plugin) {
    // The full id, so a monorepo subpackage's installs are counted against that
    // plugin rather than folded onto its repository or a sibling.
    return plugin.id.toLowerCase();
}
/** Run one plugin mutation through the shared async runner, tracking progress. */
async function runTrackedPluginCommand(profile, action, target, progress, extraArgs = []) {
    progress.active = true;
    progress.action = action;
    progress.target = target;
    progress.startedAt = Date.now();
    progress.lastLine = '';
    try {
        const result = await runPluginCommand({
            invocation: cliInvocation(),
            action: action === 'install' ? 'add' : 'remove',
            profile,
            target,
            extraArgs,
            stdio: 'capture',
            timeoutMs: COMMAND_TIMEOUT_MS,
            env: { ...process.env, CI: 'true' },
            onLine: line => { progress.lastLine = line; },
        });
        if (result.error !== null) {
            return { exitCode: 127, timedOut: false, stdout: result.stdout, stderr: `${result.stderr}\n${result.error}` };
        }
        return { exitCode: result.exitCode, timedOut: result.timedOut, stdout: result.stdout, stderr: result.stderr };
    }
    finally {
        progress.active = false;
        progress.action = null;
    }
}
/** Run one plugin mutation and report its outcome anonymously (fire-and-forget). */
async function runReportedPluginCommand(profile, plugin, action, target, progress, extraArgs = []) {
    const startedAt = new Date();
    const result = await runTrackedPluginCommand(profile, action, target, progress, extraArgs);
    const completedAt = new Date();
    const succeeded = result.exitCode === 0 && !result.timedOut;
    void reportInstallEvent({
        pluginId: pluginEventId(plugin),
        profile,
        operation: action === 'install' ? 'install' : 'remove',
        status: succeeded ? 'success' : 'failed',
        startedAt,
        completedAt,
        errorCode: succeeded ? null : failureCode(result),
    });
    return result;
}
function sendJson(response, status, value) {
    response.writeHead(status, {
        'cache-control': 'no-store',
        'content-type': 'application/json; charset=utf-8',
    });
    response.end(JSON.stringify(value));
}
function isSameOrigin(request) {
    const origin = request.headers.origin;
    const host = request.headers.host;
    if (origin === undefined || host === undefined)
        return false;
    try {
        const url = new URL(origin);
        const localHostnames = new Set(['localhost', '127.0.0.1', '[::1]']);
        return url.host === host && localHostnames.has(url.hostname);
    }
    catch {
        return false;
    }
}
async function readJsonBody(request) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > BODY_LIMIT_BYTES)
            throw new Error('request body too large');
        chunks.push(buffer);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function requireMethod(request, response, method) {
    if (request.method === method)
        return true;
    response.writeHead(405, { allow: method });
    response.end();
    return false;
}
function requireTrustedPost(request, response) {
    if (!requireMethod(request, response, 'POST'))
        return false;
    if (isSameOrigin(request))
        return true;
    sendJson(response, 403, { error: 'untrusted origin' });
    return false;
}
/**
 * Register the local market API and return a disposer for every route.
 * @param webServer - DSH web server service.
 * @param config - resolved profile and registry settings.
 * @returns a disposer that unregisters all market routes.
 */
export function mountMarketRoutes(webServer, config) {
    if (!PROFILE_RE.test(config.profile))
        throw new Error(`invalid profile name: ${config.profile}`);
    const registryUrl = new URL(config.registryUrl);
    if (registryUrl.protocol !== 'https:')
        throw new Error('registry API URL must use HTTPS');
    const updateUrl = new URL(config.updateUrl);
    if (updateUrl.protocol !== 'https:')
        throw new Error('update API URL must use HTTPS');
    let mutating = false;
    const progress = { active: false, action: null, target: '', startedAt: 0, lastLine: '' };
    const disposers = [
        webServer.register({
            kind: 'exact',
            path: '/dsh1024/registry',
            handler: async (request, response) => {
                if (!requireMethod(request, response, 'GET'))
                    return;
                try {
                    // `?revalidate=1` is the panel asking for the current catalog behind
                    // the copy it already rendered; everything else stays cache-first.
                    const revalidate = /[?&]revalidate=1(?:&|$)/.test(request.url ?? '');
                    const result = await loadRegistry(config.registryUrl, fetch, { revalidate });
                    sendJson(response, 200, result);
                }
                catch (error) {
                    sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
                }
            },
        }),
        webServer.register({
            kind: 'exact',
            path: '/dsh1024/update',
            handler: async (request, response) => {
                if (!requireMethod(request, response, 'GET'))
                    return;
                sendJson(response, 200, await checkForUpdate(config.updateUrl));
            },
        }),
        webServer.register({
            kind: 'exact',
            path: '/dsh1024/installed',
            handler: (request, response) => {
                if (!requireMethod(request, response, 'GET'))
                    return;
                sendJson(response, 200, { profile: config.profile, installed: readInstalled(config.profile) });
            },
        }),
        webServer.register({
            kind: 'exact',
            path: '/dsh1024/status',
            handler: (request, response) => {
                if (!requireMethod(request, response, 'GET'))
                    return;
                sendJson(response, 200, {
                    ...progress,
                    seconds: progress.active ? Math.round((Date.now() - progress.startedAt) / 1000) : 0,
                    installed: readInstalled(config.profile),
                });
            },
        }),
        webServer.register({
            kind: 'exact',
            path: '/dsh1024/install',
            handler: async (request, response) => {
                if (!requireTrustedPost(request, response))
                    return;
                if (mutating) {
                    sendJson(response, 409, { error: 'another plugin operation is already running' });
                    return;
                }
                try {
                    // Resolved by id: a repository URL is no longer unique now that one
                    // monorepo can contribute several plugins.
                    const body = await readJsonBody(request);
                    const requestedId = typeof body.id === 'string' ? body.id.toLowerCase() : '';
                    const { registry } = await loadRegistry(config.registryUrl);
                    const plugin = registry.plugins.find(entry => entry.id.toLowerCase() === requestedId);
                    if (plugin === undefined) {
                        sendJson(response, 400, { error: 'plugin is not in the 1024 Store registry' });
                        return;
                    }
                    const target = installTarget(plugin);
                    mutating = true;
                    try {
                        const result = await runReportedPluginCommand(config.profile, plugin, 'install', target, progress, installExtraArgs(plugin));
                        const ok = result.exitCode === 0 && !result.timedOut;
                        sendJson(response, ok ? 200 : 502, {
                            ok,
                            ...result,
                            installed: readInstalled(config.profile),
                        });
                    }
                    finally {
                        mutating = false;
                    }
                }
                catch (error) {
                    sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
                }
            },
        }),
        webServer.register({
            kind: 'exact',
            path: '/dsh1024/uninstall',
            handler: async (request, response) => {
                if (!requireTrustedPost(request, response))
                    return;
                if (mutating) {
                    sendJson(response, 409, { error: 'another plugin operation is already running' });
                    return;
                }
                try {
                    const body = await readJsonBody(request);
                    const name = typeof body.name === 'string' ? body.name : '';
                    if (!PACKAGE_RE.test(name) || name === 'dsh1024') {
                        sendJson(response, 400, { error: 'plugin cannot be uninstalled here' });
                        return;
                    }
                    const installed = readInstalled(config.profile);
                    const installedSpec = installed[name];
                    if (installedSpec === undefined) {
                        sendJson(response, 400, { error: 'plugin is not installed' });
                        return;
                    }
                    const { registry } = await loadRegistry(config.registryUrl);
                    // Prefer the plugin whose github:owner/repo target appears in the installed
                    // manifest spec so telemetry is attributed to the actually-installed plugin;
                    // fall back to the display-name match only for the catalog-membership gate
                    // (display names are not unique across the catalog — same-named forks exist).
                    const cataloged = registry.plugins.find(plugin => installedSpec.toLowerCase().includes(installTarget(plugin).toLowerCase()))
                        ?? registry.plugins.find(plugin => plugin.name === name);
                    if (cataloged === undefined) {
                        sendJson(response, 400, { error: 'plugin is not in the 1024 Store registry' });
                        return;
                    }
                    mutating = true;
                    try {
                        const result = await runReportedPluginCommand(config.profile, cataloged, 'uninstall', name, progress);
                        const ok = result.exitCode === 0 && !result.timedOut;
                        sendJson(response, ok ? 200 : 502, {
                            ok,
                            ...result,
                            installed: readInstalled(config.profile),
                        });
                    }
                    finally {
                        mutating = false;
                    }
                }
                catch (error) {
                    sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
                }
            },
        }),
    ];
    return () => {
        for (const dispose of disposers)
            dispose();
    };
}
