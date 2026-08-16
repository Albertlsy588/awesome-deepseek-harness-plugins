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
 * @param registryUrl - public 1024 Store registry API endpoint.
 * @param fetcher - injectable fetch implementation for deterministic tests.
 * @returns the registry and whether it is fresh API data or a stale fallback cache.
 */
export declare function loadRegistry(registryUrl?: string, fetcher?: typeof fetch): Promise<{
    registry: Registry;
    source: RegistrySource;
}>;
