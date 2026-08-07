/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

/**
 * The Sentry release name, and nothing else: this repo deploys continuously
 * from main and never bumps the package version, so it is a constant.
 */
declare const __APP_VERSION__: string;

/**
 * The short commit sha (`dev` when git is unavailable). It names the build in
 * Settings and busts the persisted cache, being the only value here that
 * changes per deploy (#356).
 */
declare const __APP_COMMIT__: string;
