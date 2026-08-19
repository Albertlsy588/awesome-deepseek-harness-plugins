/** Fetch and validate the public 1024 Store registry API. */
export interface RegistryCategory {
    id: string;
    order: number;
    label: Record<string, string>;
}
export interface RegistryPlugin {
    id: string;
    name: string;
    owner: string;
    url: string;
    category: string;
    description: Record<string, string>;
    install: string;
    /** Server-derived preferred package spec; absent on older registry responses. */
    target?: string;
    /** Package allowed to run a source-install build script. */
    allowBuild?: string | null;
    added: string;
    stars?: number | null;
}
export interface Registry {
    name: string;
    updated: string;
    count: number;
    categories: RegistryCategory[];
    plugins: RegistryPlugin[];
}
export type RegistrySource = 'api' | 'cache';
export declare const DEFAULT_REGISTRY_URL = "https://deepseek1024.com/api/v1/registry";
/**
 * Validate untrusted registry JSON before it can become an installation allowlist.
 * @param value - parsed `/api/v1/registry` response.
 * @returns the validated registry.
 */
export declare function validateRegistry(value: unknown): Registry;
/**
 * Parse the only repository URL form accepted by the installer.
 * @param url - curated plugin repository URL.
 * @returns the GitHub owner/repository pair, or null for an unsupported URL.
 */
export declare function parseGitHubSource(url: string): string | null;
/**
 * The plugin's in-repo directory, taken from its id and cross-checked against
 * the repository URL. A monorepo subpackage's id extends its repository with
 * the directory the plugin lives in.
 * @param id - curated plugin id.
 * @param repository - owner/repository parsed from the plugin's URL.
 * @returns the subdirectory, or `''` for a repository-level plugin.
 */
export declare function pluginSubPath(id: string, repository: string): string;
/** Return the server-derived preferred target after constraining its grammar. */
export declare function installTarget(plugin: RegistryPlugin): string;
/** Extra official CLI arguments needed by the preferred install method. */
export declare function installExtraArgs(plugin: RegistryPlugin): string[];
/** Clear process-local registry state for deterministic tests. */
export declare function clearRegistryCache(): void;
export interface LoadRegistryOptions {
    /**
     * Go to the network even when the process cache is still fresh, and answer
     * with what comes back. Used when the store panel opens or becomes visible
     * again, so a newly listed plugin shows up without waiting out any TTL.
     */
    revalidate?: boolean;
}
/**
 * Load the registry from the configured HTTPS API, with a last-good response cache.
 *
 * The default path stays cache-first so rendering the panel never waits on the
 * network. `revalidate` is the stale-while-revalidate half: the caller already
 * has something on screen and wants the current catalog behind it.
 * @param registryUrl - public 1024 Store registry API endpoint.
 * @param fetcher - injectable fetch implementation for deterministic tests.
 * @param options - set `revalidate` to force a network read.
 * @returns the registry and whether it is fresh API data or a stale fallback cache.
 */
export declare function loadRegistry(registryUrl?: string, fetcher?: typeof fetch, options?: LoadRegistryOptions): Promise<{
    registry: Registry;
    source: RegistrySource;
}>;
