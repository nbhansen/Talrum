import { captureMessage } from './telemetry';

const RELOADED_AT = 'talrum-preload-reloaded';
const RELOAD_COUNT = 'talrum-preload-reload-count';

// A recovery reload lands within seconds. A stamp younger than this means
// the reload already happened and did not fix the failure.
const RELOAD_WINDOW_MS = 30_000;

// The stamp alone only guards a loop whose reload -> next-failure round trip
// is faster than RELOAD_WINDOW_MS. A chunk request that stalls until the
// browser gives up can outlast it, so cap the reloads in a longer window too
// (#443 review round 3).
const BURST_WINDOW_MS = 10 * 60_000;
const MAX_RELOADS = 3;

// Storage access is guarded like every other storage read in this repo
// (see lastBoard.ts): a blocked sessionStorage throws SecurityError
// (privacy mode, "block all cookies"), and this runs at boot, before
// render — an uncaught throw here would white-screen the app.
interface Recovery {
  age: number;
  reloads: number;
}

// Returns null when storage is blocked. 'blocked' stays its own state, not
// folded into "already reloaded": a storage-blocked browser never reloaded,
// and reporting it as "still failing after a recovery reload" would read in
// Sentry as the reload fix not working.
const readRecovery = (): Recovery | null => {
  try {
    const at = Number(sessionStorage.getItem(RELOADED_AT));
    const age = at > 0 ? Date.now() - at : Infinity;
    // A stamp older than the burst window belongs to a previous deploy's
    // recovery, not to a loop: the tab is armed and the count starts over.
    const reloads = age < BURST_WINDOW_MS ? Number(sessionStorage.getItem(RELOAD_COUNT)) || 0 : 0;
    return { age, reloads };
  } catch {
    return null;
  }
};

const writeRecovery = (reloads: number): boolean => {
  try {
    sessionStorage.setItem(RELOADED_AT, String(Date.now()));
    sessionStorage.setItem(RELOAD_COUNT, String(reloads));
    return true;
  } catch {
    return false;
  }
};

let listener: AbortController | null = null;

// window.location.reload() does not stop the current document — it keeps
// running until the navigation commits. A second failure in that gap is the
// recovery in flight, not a recovery that failed (#443 review round 3).
let reloading = false;

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
 * One reload fetches the current `index.html` with the current asset names.
 * Two guards stop a reload loop when a reload does not fix it: a fresh
 * timestamp catches a fast loop, and a reload count catches a slow one. A
 * stamp older than BURST_WINDOW_MS re-arms the tab and clears the count, so
 * the long-lived tab this exists for also survives the deploy after next.
 *
 * The event's default is deliberately NOT prevented: preventing it makes
 * the failed import resolve `undefined` instead of rejecting, which the
 * route table's `.then((m) => ...)` turns into an opaque TypeError. Letting
 * the original error propagate keeps the diagnosable "Unable to preload"
 * message in Sentry while the reload is already on its way — the same
 * shape as the vite:preloadError example in Vite's own docs.
 */
export const installPreloadErrorRecovery = (): void => {
  // Idempotent: a second install replaces the first listener instead of
  // stacking a duplicate. A fresh install means a fresh document, so no
  // reload is in flight.
  listener?.abort();
  listener = new AbortController();
  reloading = false;

  window.addEventListener(
    'vite:preloadError',
    () => {
      // The recovery is on its way and stays silent: reporting here would
      // say the fix does not work while it is still working.
      if (reloading) return;

      // Offline, a reload cannot fetch the missing chunk, and it tears down
      // the running app for a browser network error page if the precache
      // cannot serve the navigation. Let the error go to the route
      // boundary, which offers the reload when the connection is back
      // (#443 review round 4). Only the false value of navigator.onLine is
      // reliable: true also means "connected to a network that goes
      // nowhere", so the recovery is not gated on it.
      if (!navigator.onLine) return;

      // Read at error time, not install time: the recovered page keeps its
      // fresh stamp for the whole window, but must be armed again by the
      // time the next deploy lands under it.
      const recovery = readRecovery();
      if (recovery === null) {
        // No storage means no loop guard, so never start a reload.
        captureMessage('Chunk load failed with storage blocked — cannot auto-reload', {
          level: 'warning',
        });
        return;
      }
      if (recovery.age < RELOAD_WINDOW_MS) {
        // Reloading did not fix it — not a stale deploy, so let the error
        // propagate to the route boundary and say what happened.
        captureMessage('Chunk load still failing after a recovery reload', {
          level: 'warning',
        });
        return;
      }
      if (recovery.reloads >= MAX_RELOADS) {
        captureMessage(`Chunk load still failing after ${MAX_RELOADS} recovery reloads`, {
          level: 'warning',
        });
        return;
      }
      // Stamp first: reloading without a written loop guard could repeat
      // forever.
      if (!writeRecovery(recovery.reloads + 1)) return;
      reloading = true;
      window.location.reload();
    },
    { signal: listener.signal },
  );
};
