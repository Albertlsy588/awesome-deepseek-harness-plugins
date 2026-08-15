/** Local HTTP routes for browsing and managing 1024 Store plugins. */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { installTarget, loadRegistry, parseGitHubSource } from './registry.js';
import { reportInstallEvent } from './telemetry.js';
import { checkForUpdate } from './update.js';
const PROFILE_RE = /^[A-Za-z0-9_-]+$/;
const PACKAGE_RE = /^(?:@[a-z0-9._-]+\/)?[A-Za-z0-9._-]+$/;
const TARGET_RE = /^[A-Za-z0-9@:/._#+-]+$/;
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
            args: [...process.execArgv, absoluteEntry],
            cwd: dirname(absoluteEntry),
            shell: false,
        };
    }
    return { file: 'dsh', args: [], shell: process.platform === 'win32' };
}
function stopChild(child) {
    if (process.platform === 'win32' && child.pid !== undefined) {
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
        killer.once('error', () => { child.kill('SIGKILL'); });
        return;
    }
    child.kill('SIGKILL');
}
function lastOutputLine(text) {
    return text.split('\n').map(line => line.trim()).filter(Boolean).at(-1)?.slice(0, 240) ?? '';
}
function runPluginCommand(profile, args, progress, action) {
    const target = args.at(-1) ?? '';
    if (!TARGET_RE.test(target)) {
        return Promise.resolve({ exitCode: 1, timedOut: false, stdout: '', stderr: 'unsafe plugin target' });
    }
    const invocation = cliInvocation();
    progress.active = true;
    progress.action = action;
    progress.target = target;
    progress.startedAt = Date.now();
    progress.lastLine = '';
    return new Promise(resolvePromise => {
        const child = spawn(invocation.file, [...invocation.args, 'plugin', '--profile', profile, ...args], {
            cwd: invocation.cwd,
            env: { ...process.env, CI: 'true' },
            shell: invocation.shell,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            stopChild(child);
        }, COMMAND_TIMEOUT_MS);
        const collect = (kind, chunk) => {
            const text = chunk.toString();
            if (kind === 'stdout')
                stdout = (stdout + text).slice(-64 * 1024);
            else
                stderr = (stderr + text).slice(-64 * 1024);
            progress.lastLine = lastOutputLine(text) || progress.lastLine;
        };
        child.stdout.on('data', (chunk) => { collect('stdout', chunk); });
        child.stderr.on('data', (chunk) => { collect('stderr', chunk); });
        child.once('error', error => {
            clearTimeout(timer);
            progress.active = false;
            progress.action = null;
            resolvePromise({ exitCode: 127, timedOut: false, stdout, stderr: `${stderr}\n${error.message}` });
        });
        child.once('close', code => {
            clearTimeout(timer);
            progress.active = false;
            progress.action = null;
            resolvePromise({ exitCode: code, timedOut, stdout, stderr });
        });
    });
}
function failureCode(result) {
    if (result.timedOut)
        return 'TIMED_OUT';
    if (result.exitCode === 127)
        return 'SPAWN_FAILED';
    return 'OFFICIAL_CLI_FAILED';
}
function pluginEventId(plugin) {
    return (parseGitHubSource(plugin.url) ?? plugin.id).toLowerCase();
}
/** Run one plugin mutation and report its outcome anonymously (fire-and-forget). */
async function runReportedPluginCommand(profile, plugin, args, progress, action) {
    const startedAt = new Date();
    const result = await runPluginCommand(profile, args, progress, action);
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
                    const result = await loadRegistry(config.registryUrl);
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
                    const body = await readJsonBody(request);
                    const requestedUrl = typeof body.url === 'string' ? body.url : '';
                    const { registry } = await loadRegistry(config.registryUrl);
                    const plugin = registry.plugins.find(entry => entry.url.toLowerCase() === requestedUrl.toLowerCase());
                    if (plugin === undefined) {
                        sendJson(response, 400, { error: 'plugin is not in the 1024 Store registry' });
                        return;
                    }
                    const target = installTarget(plugin);
                    mutating = true;
                    try {
                        const result = await runReportedPluginCommand(config.profile, plugin, ['add', target], progress, 'install');
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
                        const result = await runReportedPluginCommand(config.profile, cataloged, ['remove', name], progress, 'uninstall');
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
