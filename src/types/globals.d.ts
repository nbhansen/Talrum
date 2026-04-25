/**
 * Vite `define` replaces `__APP_VERSION__` at build time with the package.json
 * version string. The value busts the persisted React Query cache when domain
 * types change — bump package.json and the next cold boot starts fresh.
 */
declare const __APP_VERSION__: string;
