/** Fetch and validate the public 1024 Store registry API. */
export const DEFAULT_REGISTRY_URL = 'https://deepseek1024.com/api/v1/registry';
const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8_000;
let cache = null;
function isStringMap(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return false;
    return Object.values(value).every(item => typeof item === 'string');
}
function isCategory(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return false;
    const category = value;
    return typeof category.id === 'string'
        && typeof category.order === 'number'
        && isStringMap(category.label);
}
function isPlugin(value, categoryIds) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return false;
    const plugin = value;
    return typeof plugin.id === 'string'
        && typeof plugin.name === 'string'
        && typeof plugin.owner === 'string'
        && typeof plugin.url === 'string'
        && parseGitHubSource(plugin.url) !== null
        && typeof plugin.category === 'string'
        && categoryIds.has(plugin.category)
        && isStringMap(plugin.description)
        && typeof plugin.install === 'string'
        && typeof plugin.added === 'string'
        && (plugin.stars === undefined || plugin.stars === null || typeof plugin.stars === 'number');
}
/**
 * Validate untrusted registry JSON before it can become an installation allowlist.
 * @param value - parsed `/api/v1/registry` response.
 * @returns the validated registry.
 */
export function validateRegistry(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('registry must be an object');
    }
    const registry = value;
    if (typeof registry.name !== 'string' || typeof registry.updated !== 'string' || typeof registry.count !== 'number') {
        throw new Error('registry metadata is invalid');
    }
    if (!Array.isArray(registry.categories) || !registry.categories.every(isCategory)) {
        throw new Error('registry categories are invalid');
    }
    const categoryIds = new Set(registry.categories.map(category => category.id));
    if (!Array.isArray(registry.plugins) || registry.plugins.length === 0) {
        throw new Error('registry plugins are empty');
    }
    if (registry.count !== registry.plugins.length)
        throw new Error('registry count does not match plugins');
    if (!registry.plugins.every(plugin => isPlugin(plugin, categoryIds))) {
        throw new Error('registry contains an invalid plugin');
    }
    return registry;
}
/**
 * Parse the only repository URL form accepted by the installer.
 * @param url - curated plugin repository URL.
 * @returns the GitHub owner/repository pair, or null for an unsupported URL.
 */
export function parseGitHubSource(url) {
    const match = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/?$/.exec(url);
    return match?.[1] ?? null;
}
const ID_SEGMENT = /^[A-Za-z0-9_.-]+$/;
/**
 * The plugin's in-repo directory, taken from its id and cross-checked against
 * the repository URL. A monorepo subpackage's id extends its repository with
 * the directory the plugin lives in.
 * @param id - curated plugin id.
 * @param repository - owner/repository parsed from the plugin's URL.
 * @returns the subdirectory, or `''` for a repository-level plugin.
 */
export function pluginSubPath(id, repository) {
    const segments = id.split('/');
    if (segments.length < 2)
        throw new Error('unsupported plugin id');
    if (segments.slice(0, 2).join('/').toLowerCase() !== repository.toLowerCase()) {
        throw new Error('plugin id does not match its repository URL');
    }
    const rest = segments.slice(2);
    if (!rest.every(segment => ID_SEGMENT.test(segment) && segment !== '.' && segment !== '..')) {
        throw new Error('unsupported plugin subdirectory');
    }
    return rest.join('/');
}
/**
 * Derive a pnpm package spec without trusting the registry's display command.
 * @param plugin - validated curated plugin.
 * @returns an immutable GitHub package spec.
 */
export function installTarget(plugin) {
    const repository = parseGitHubSource(plugin.url);
    if (repository === null)
        throw new Error('unsupported plugin repository URL');
    const subPath = pluginSubPath(plugin.id, repository);
    return subPath === '' ? `github:${repository}` : `github:${repository}#path:${subPath}`;
}
/** Clear process-local registry state for deterministic tests. */
export function clearRegistryCache() {
    cache = null;
}
/**
 * Load the registry from the configured HTTPS API, with a last-good response cache.
 * @param registryUrl - public 1024 Store registry API endpoint.
 * @param fetcher - injectable fetch implementation for deterministic tests.
 * @returns the registry and whether it is fresh API data or a stale fallback cache.
 */
export async function loadRegistry(registryUrl = DEFAULT_REGISTRY_URL, fetcher = fetch) {
    if (cache !== null && cache.url === registryUrl && Date.now() - cache.at < CACHE_TTL_MS) {
        return { registry: cache.registry, source: 'api' };
    }
    try {
        const url = new URL(registryUrl);
        if (url.protocol !== 'https:')
            throw new Error('registry API URL must use HTTPS');
        const response = await fetcher(url, {
            headers: { accept: 'application/json' },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!response.ok)
            throw new Error(`registry API HTTP ${response.status}`);
        const registry = validateRegistry(await response.json());
        cache = { url: registryUrl, at: Date.now(), registry };
        return { registry, source: 'api' };
    }
    catch (error) {
        if (cache !== null && cache.url === registryUrl) {
            return { registry: cache.registry, source: 'cache' };
        }
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`registry API unavailable: ${detail}`);
    }
}
