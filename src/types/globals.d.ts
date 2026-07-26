/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

/**
 * Vite `define` replaces `__APP_VERSION__` at build time with the package.json
 * version string. It is the Sentry release name, and nothing else — the repo
 * deploys continuously from main and never bumps the version, so it is a
 * constant and cannot express "this build is different from that one".
 */
declare const __APP_VERSION__: string;

/**
 * Vite `define` replaces `__APP_COMMIT__` at build time with the short commit
 * sha (`dev` when git is unavailable). It identifies the deployed build in
 * Settings, and busts the persisted React Query cache: it is the only value
 * here that actually changes per deploy, which is what a cache buster has to
 * do (#356).
 */
declare const __APP_COMMIT__: string;
