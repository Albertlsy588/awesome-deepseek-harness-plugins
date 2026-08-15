/** Anonymous install telemetry aligned with the @dsh-1024store/cli event contract. */
export declare const DEFAULT_TELEMETRY_URL = "https://deepseek1024.com/api/v1/install-events";
export declare const TELEMETRY_SOURCE_CHANNEL = "dsh-1024store-plugin";
/** The exact public event schema shared with the CLI, the Worker, and the docs. */
export declare const EVENT_KEYS: readonly ['eventId', 'clientId', 'pluginId', 'profile', 'operation', 'status', 'clientStartedAt', 'clientCompletedAt', 'durationMs', 'beforeVersion', 'afterVersion', 'requestedRef', 'cliVersion', 'dshVersion', 'errorCode', 'sourceChannel', 'platform', 'arch', 'isCi'];
export interface InstallEvent {
    eventId: string;
    clientId: string;
    pluginId: string;
    profile: string;
    operation: 'install' | 'remove';
    status: 'success' | 'failed';
    clientStartedAt: string;
    clientCompletedAt: string;
    durationMs: number;
    beforeVersion: string | null;
    afterVersion: string | null;
    requestedRef: string | null;
    cliVersion: string;
    dshVersion: string | null;
    errorCode: string | null;
    sourceChannel: string;
    platform: string;
    arch: string;
    isCi: boolean;
}
export interface InstallEventInput {
    pluginId: string;
    profile: string;
    operation: 'install' | 'remove';
    status: 'success' | 'failed';
    startedAt: Date;
    completedAt: Date;
    errorCode: string | null;
}
export interface TelemetryContext {
    env?: NodeJS.ProcessEnv;
    fetcher?: typeof fetch;
    now?: () => Date;
    uuid?: () => string;
    log?: (line: string) => void;
    platform?: string;
    arch?: string;
}
/** Whether DO_NOT_TRACK / DSH_1024STORE_TELEMETRY turn telemetry off, mirroring the CLI. */
export declare function environmentDisablesTelemetry(env: NodeJS.ProcessEnv): boolean;
/** Reduce the host platform to the CLI's reporting whitelist. */
export declare function detectPlatform(value?: string): string;
/** Reduce the host architecture to the CLI's reporting whitelist. */
export declare function detectArch(value?: string): string;
/** Detect CI environments with the same probes as the CLI. */
export declare function detectCi(env: NodeJS.ProcessEnv): boolean;
/**
 * Report one plugin install/remove outcome to the public install-events API.
 * Fire-and-forget: no queue, 2.5s timeout, and every failure is silent so
 * telemetry can never affect a plugin operation. Respects DO_NOT_TRACK,
 * DSH_1024STORE_TELEMETRY, and an opted-out shared CLI identity; when opted
 * out no identity is created and nothing is sent.
 */
export declare function reportInstallEvent(input: InstallEventInput, context?: TelemetryContext): Promise<void>;
