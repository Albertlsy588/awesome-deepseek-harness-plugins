/** Local HTTP routes for browsing and managing 1024 Store plugins. */
import type { IncomingMessage, ServerResponse } from 'node:http';
export interface WebRoute {
    kind: 'exact';
    path: string;
    handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;
}
export interface WebServerService {
    register(route: WebRoute): () => void;
}
export interface MarketRouteConfig {
    profile: string;
    registryUrl: string;
    updateUrl: string;
}
/**
 * Read non-official dependencies installed into one profile.
 * @param profile - validated profile name.
 * @returns package names mapped to their manifest specs.
 */
export declare function readInstalled(profile: string): Record<string, string>;
/**
 * Register the local market API and return a disposer for every route.
 * @param webServer - DSH web server service.
 * @param config - resolved profile and registry settings.
 * @returns a disposer that unregisters all market routes.
 */
export declare function mountMarketRoutes(webServer: WebServerService, config: MarketRouteConfig): () => void;
