/** Automatic update checks for the 1024 Store plugin itself. */
export interface UpdateInfo {
    checked: boolean;
    currentVersion: string;
    latestVersion: string | null;
    updateAvailable: boolean;
    releaseUrl: string;
    error?: string;
}
export declare const DEFAULT_UPDATE_URL = "https://deepseek1024.com/api/dsh-1024store";
export declare const DEFAULT_UPDATE_FALLBACK_URL = "https://api.github.com/repos/imsai-sh/awesome-deepseek-harness-plugins/contents/package.json?ref=main";
export declare const DEFAULT_RELEASE_URL = "https://github.com/imsai-sh/awesome-deepseek-harness-plugins/tree/main/packages/dsh-1024store";
export declare const CURRENT_VERSION: string;
/** Compare two semantic versions. Positive means left is newer. */
export declare function compareVersions(leftValue: string, rightValue: string): number;
/**
 * Query the first-party version API and fall back to the repository API.
 * Failures are returned as state so an unavailable checker never blocks the market.
 */
export declare function checkForUpdate(updateUrl?: string, fallbackUrl?: string, fetcher?: typeof fetch): Promise<UpdateInfo>;
