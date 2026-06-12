/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

/**
 * Vite `define` replaces `__APP_VERSION__` at build time with the package.json
 * version string. The value busts the persisted React Query cache when domain
 * types change — bump package.json and the next cold boot starts fresh.
 */
declare const __APP_VERSION__: string;

/**
 * Vite `define` replaces `__APP_COMMIT__` at build time with the short commit
 * sha (`dev` when git is unavailable). Display-only — identifies the deployed
 * build in Settings. Deliberately not part of the Sentry release name or the
 * cache buster: those stay pinned to the package.json version.
 */
declare const __APP_COMMIT__: string;
