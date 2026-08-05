import { captureMessage } from './telemetry';

const RELOADED_FLAG = 'talrum-preload-reloaded';

// A recovery reload lands within seconds. A stamp older than this is a
// previous deploy's recovery, not a loop — the tab is armed again.
const RELOAD_WINDOW_MS = 30_000;

// Storage access is guarded like every other storage read in this repo
// (see lastBoard.ts): a blocked sessionStorage throws SecurityError
// (privacy mode, "block all cookies"), and this runs at boot, before
// render — an uncaught throw here would white-screen the app.

// 'blocked' is its own state, not folded into 'recent': a storage-blocked
// browser never reloaded, and reporting it as "still failing after a
// recovery reload" would read in Sentry as the reload fix not working.
type ReloadState = 'armed' | 'recent' | 'blocked';

const reloadState = (): ReloadState => {
  try {
    const stamp = Number(sessionStorage.getItem(RELOADED_FLAG));
    return stamp > 0 && Date.now() - stamp < RELOAD_WINDOW_MS ? 'recent' : 'armed';
  } catch {
    return 'blocked';
  }
};

const stampReload = (): boolean => {
  try {
    sessionStorage.setItem(RELOADED_FLAG, String(Date.now()));
    return true;
  } catch {
    return false;
  }
};

/**
 * Recovers from a deploy landing under an open tab (#442).
 *
 * Each deploy replaces the hashed asset files, so a tab that loaded the
 * previous `index.html` asks for chunks that no longer exist on the
 * server. The old chunk is gone from the cache too: the activating worker
 * (`skipWaiting` + `clientsClaim`) drops the previous deploy's precache
 * entries via `cleanupOutdatedCaches`. The next lazy-route navigation then
 * fails and the user sees a broken page.
 *
 * Vite fires `vite:preloadError` when a dynamic import or its CSS fails.
 * One reload fetches the current `index.html` with the current asset
 * names. The sessionStorage timestamp stops a reload loop when a reload
 * does not fix it (the failure is then something else, and it is reported
 * instead) — while a stamp older than RELOAD_WINDOW_MS re-arms the tab, so
 * the long-lived tab this exists for also survives the deploy after next.
 *
 * The event's default is deliberately NOT prevented: preventing it makes
 * the failed import resolve `undefined` instead of rejecting, which the
 * route table's `.then((m) => ...)` turns into an opaque TypeError. Letting
 * the original error propagate keeps the diagnosable "Unable to preload"
 * message in Sentry while the reload is already on its way — the same
 * shape as the vite:preloadError example in Vite's own docs.
 */
let listener: AbortController | null = null;

export const installPreloadErrorRecovery = (): void => {
  // Idempotent: a second install replaces the first listener instead of
  // stacking a duplicate.
  listener?.abort();
  listener = new AbortController();

  window.addEventListener(
    'vite:preloadError',
    () => {
      // Checked at error time, not install time: the recovered page keeps
      // its fresh stamp for the whole window, but must be armed again by
      // the time the next deploy lands under it.
      const state = reloadState();
      if (state === 'blocked') {
        // No storage means no loop guard, so never start a reload.
        captureMessage('Chunk load failed with storage blocked — cannot auto-reload', {
          level: 'warning',
        });
        return;
      }
      if (state === 'recent') {
        // Reloading did not fix it — not a stale deploy, so let the error
        // propagate to the route boundary and say what happened.
        captureMessage('Chunk load still failing after a recovery reload', {
          level: 'warning',
        });
        return;
      }
      // Stamp first: reloading without a written loop guard could repeat
      // forever.
      if (!stampReload()) return;
      window.location.reload();
    },
    { signal: listener.signal },
  );
};
