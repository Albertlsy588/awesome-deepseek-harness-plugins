/** Fetch and validate the public 1024 Store catalog API. */
export const DEFAULT_REGISTRY_URL = 'https://deepseek1024.com/api/plugin?sort=stars';
const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8_000;
let cache = null;
function isStringMap(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return false;
    return Object.values(value).every(item => typeof item === 'string');
}
function isPlugin(value, categories) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return false;
    const plugin = value;
    return typeof plugin.name === 'string'
        && typeof plugin.owner === 'string'
        && typeof plugin.url === 'string'
        && parseGitHubSource(plugin.url) !== null
        && typeof plugin.category === 'string'
        && plugin.category in categories
        && isStringMap(plugin.description)
        && typeof plugin.install === 'string'
        && typeof plugin.added === 'string'
        && (plugin.stars === undefined || plugin.stars === null || typeof plugin.stars === 'number');
}
/**
 * Validate untrusted registry JSON before it can become an installation allowlist.
 * @param value - parsed JSON value.
 * @returns the validated registry.
 */
export function validateRegistry(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('registry must be an object');
    }
    const registry = value;
    if (typeof registry.updated !== 'string' || typeof registry.count !== 'number') {
        throw new Error('registry metadata is invalid');
    }
    if (registry.categories === null || typeof registry.categories !== 'object' || Array.isArray(registry.categories)) {
        throw new Error('registry categories are invalid');
    }
    const categories = registry.categories;
    if (!Object.values(categories).every(isStringMap))
        throw new Error('registry category labels are invalid');
    const typedCategories = categories;
    if (!Array.isArray(registry.plugins) || registry.plugins.length === 0) {
        throw new Error('registry plugins are empty');
    }
    if (registry.count !== registry.plugins.length)
        throw new Error('registry count does not match plugins');
    if (!registry.plugins.every(plugin => isPlugin(plugin, typedCategories))) {
        throw new Error('registry contains an invalid plugin');
    }
    return registry;
}
/**
 * Normalize the richer public catalog API into the compact market model.
 * @param value - parsed `/api/plugin` response.
 * @returns the validated registry used by the local installer allowlist.
 */
export function validateCatalogResponse(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('catalog API response must be an object');
    }
    const catalog = value;
    if (!Array.isArray(catalog.categories) || !Array.isArray(catalog.packages)) {
        throw new Error('catalog API collections are invalid');
    }
    if (catalog.meta === null || typeof catalog.meta !== 'object' || Array.isArray(catalog.meta)) {
        throw new Error('catalog API metadata is invalid');
    }
    const categories = catalog.categories;
    const validCategory = (item) => {
        if (item === null || typeof item !== 'object' || Array.isArray(item))
            return false;
        const category = item;
        return typeof category.id === 'string'
            && typeof category.en === 'string'
            && typeof category.zh === 'string';
    };
    if (!categories.every(validCategory))
        throw new Error('catalog API categories are invalid');
    const categoryMap = Object.fromEntries(categories.map(category => [category.id, { en: category.en, zh: category.zh }]));
    const meta = catalog.meta;
    const normalized = {
        updated: meta.updated,
        count: meta.catalogTotal,
        categories: categoryMap,
        plugins: catalog.packages,
    };
    return validateRegistry(normalized);
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
/**
 * Derive a pnpm package spec without trusting the registry's display command.
 * @param plugin - validated curated plugin.
 * @returns an immutable GitHub package spec.
 */
export function installTarget(plugin) {
    const repository = parseGitHubSource(plugin.url);
    if (repository === null)
        throw new Error('unsupported plugin repository URL');
    return `github:${repository}`;
}
/** Clear process-local registry state for deterministic tests. */
export function clearRegistryCache() {
    cache = null;
}
/**
 * Load the registry from the configured HTTPS API, with a last-good response cache.
 * @param registryUrl - public 1024 Store catalog API endpoint.
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
            throw new Error('catalog API URL must use HTTPS');
        const response = await fetcher(url, {
            headers: { accept: 'application/json' },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!response.ok)
            throw new Error(`catalog API HTTP ${response.status}`);
        const registry = validateCatalogResponse(await response.json());
        cache = { url: registryUrl, at: Date.now(), registry };
        return { registry, source: 'api' };
    }
    catch (error) {
        if (cache !== null && cache.url === registryUrl) {
            return { registry: cache.registry, source: 'cache' };
        }
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`catalog API unavailable: ${detail}`);
    }
}
