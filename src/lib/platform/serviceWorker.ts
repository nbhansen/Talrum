import { captureMessage } from './telemetry';

const SW_URL = '/sw.js';
const SW_SCOPE = '/';

/**
 * `injectRegister: false` in vite.config.ts makes this the only registration
 * path. A refused registration is a warning, not a crash (#375) — but not
 * nothing either: no worker means no precache, so no offline kid mode.
 */
export const registerServiceWorker = (): void => {
  // Dev builds generate no /sw.js, so this would 404 on every reload.
  if (!import.meta.env.PROD) return;

  // Silent: no support is a static fact, and reporting it mostly logs crawlers.
  if (!('serviceWorker' in navigator)) return;

  // The old worker already served this page; reload once so the new build shows (#502).
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        window.location.reload();
      },
      { once: true },
    );
  }

  const register = (): void => {
    void navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE }).catch((error: unknown) => {
      captureMessage('Service worker registration failed — offline mode unavailable', {
        level: 'warning',
        // Browser-generated; carries no board or kid content.
        extra: {
          reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        },
      });
    });
  };

  // Registering competes with page load, so wait for it — but `load` never
  // fires twice, so a module that evaluates late must register immediately.
  if (document.readyState === 'complete') {
    register();
    return;
  }
  window.addEventListener('load', register, { once: true });
};
