import { captureMessage } from './telemetry';

const SW_URL = '/sw.js';
const SW_SCOPE = '/';

/**
 * Registers the generated service worker — and, unlike the snippet
 * vite-plugin-pwa used to inject for us, handles the failure.
 *
 * That snippet was a bare `navigator.serviceWorker.register(...)` with no
 * `.catch()`, so any browser that refuses to register produced an unhandled
 * promise rejection which Sentry reported as a crash (TALRUM-2, #375). The
 * observed case was `Error: Rejected` thrown from a monkey-patched
 * `register` — how privacy extensions, hardened configurations and some
 * crawlers block service workers. Nothing we can fix in our code, and not a
 * crash.
 *
 * But it is not nothing either: no service worker means no precache, so no
 * offline kid mode — the app's central promise, quietly switched off. So the
 * failure is reported deliberately, as a warning, and the app carries on
 * working online.
 *
 * `injectRegister: false` in vite.config.ts makes this the only registration
 * path. `registerType: 'autoUpdate'` still applies: auto-update comes from
 * `skipWaiting` + `clientsClaim` in the generated worker, not from this call.
 */
export const registerServiceWorker = (): void => {
  // Dev builds have no service worker at all (`devOptions.enabled: false`), so
  // there is no /sw.js to register and trying would 404 on every reload.
  if (!import.meta.env.PROD) return;

  // Deliberately silent: a browser without service-worker support is a static
  // fact, not a regression, and reporting it would mostly log crawlers.
  if (!('serviceWorker' in navigator)) return;

  const register = (): void => {
    void navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE }).catch((error: unknown) => {
      captureMessage('Service worker registration failed — offline mode unavailable', {
        level: 'warning',
        // The reason is a browser-generated message about the worker URL and
        // scope; it carries no board or kid content.
        extra: {
          reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        },
      });
    });
  };

  // Registering competes with page load, so wait for it — but only if it has
  // not already happened. `load` never fires twice, so a module that evaluates
  // after it (a slow chunk, a late import) would otherwise never register at
  // all. The snippet this replaces had that same latent gap.
  if (document.readyState === 'complete') {
    register();
    return;
  }
  window.addEventListener('load', register, { once: true });
};
