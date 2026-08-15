/** Fetch and validate the public 1024 Store catalog API. */
export interface RegistryPlugin {
    name: string;
    owner: string;
    url: string;
    category: string;
    description: Record<string, string>;
    install: string;
    added: string;
    stars?: number | null;
}
export interface Registry {
    updated: string;
    count: number;
    categories: Record<string, Record<string, string>>;
    plugins: RegistryPlugin[];
}
export type RegistrySource = 'api' | 'cache';
export declare const DEFAULT_REGISTRY_URL = "https://deepseek1024.com/api/plugin?sort=stars";
/**
 * Validate untrusted registry JSON before it can become an installation allowlist.
 * @param value - parsed JSON value.
 * @returns the validated registry.
 */
export declare function validateRegistry(value: unknown): Registry;
/**
 * Normalize the richer public catalog API into the compact market model.
 * @param value - parsed `/api/plugin` response.
 * @returns the validated registry used by the local installer allowlist.
 */
export declare function validateCatalogResponse(value: unknown): Registry;
/**
 * Parse the only repository URL form accepted by the installer.
 * @param url - curated plugin repository URL.
 * @returns the GitHub owner/repository pair, or null for an unsupported URL.
 */
export declare function parseGitHubSource(url: string): string | null;
/**
 * Derive a pnpm package spec without trusting the registry's display command.
 * @param plugin - validated curated plugin.
 * @returns an immutable GitHub package spec.
 */
export declare function installTarget(plugin: RegistryPlugin): string;
/** Clear process-local registry state for deterministic tests. */
export declare function clearRegistryCache(): void;
/**
 * Load the registry from the configured HTTPS API, with a last-good response cache.
 * @param registryUrl - public 1024 Store catalog API endpoint.
 * @param fetcher - injectable fetch implementation for deterministic tests.
 * @returns the registry and whether it is fresh API data or a stale fallback cache.
 */
export declare function loadRegistry(registryUrl?: string, fetcher?: typeof fetch): Promise<{
    registry: Registry;
    source: RegistrySource;
}>;
