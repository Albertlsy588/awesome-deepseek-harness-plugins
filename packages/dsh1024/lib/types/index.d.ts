/** 1024 Store market host plugin. */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "dsh1024";
export interface Config {
    /** DSH profile that owns plugin mutations. Defaults to the booted profile. */
    profile?: string;
    /** HTTPS registry endpoint. */
    registryUrl?: string;
    /** HTTPS endpoint that reports the latest dsh1024 version. */
    updateUrl?: string;
}
/**
 * Mount the market routes after the web server service becomes available.
 * @param ctx - Cordis host context.
 * @param config - optional profile and registry overrides.
 */
export declare function apply(ctx: Context, config?: Config): void;
