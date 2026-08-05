import { captureMessage } from './telemetry';

const RELOADED_FLAG = 'talrum-preload-reloaded';

// A recovery reload lands within seconds. A stamp older than this is a
// previous deploy's recovery, not a loop — the tab is armed again.
const RELOAD_WINDOW_MS = 30_000;

// Storage access is guarded like every other storage read in this repo
// (see lastBoard.ts): a blocked sessionStorage throws SecurityError
// (privacy mode, "block all cookies"), and this runs at boot, before
// render — an uncaught throw here would white-screen the app.

// Fail safe is "reloaded just now": without storage there is no loop
// guard, so never start a reload.
const reloadedRecently = (): boolean => {
  try {
    const stamp = Number(sessionStorage.getItem(RELOADED_FLAG));
    return stamp > 0 && Date.now() - stamp < RELOAD_WINDOW_MS;
  } catch {
    return true;
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
 * previous `index.html` asks for chunks that no longer exist on the server.
 * The precache would cover the gap, but it is wiped at auth boundaries
 * (#431) and the new worker activates immediately (`autoUpdate`). The next
 * lazy-route navigation then fails and the user sees a broken page.
 *
 * Vite fires `vite:preloadError` when a dynamic import or its CSS fails.
 * One reload fetches the current `index.html` with the current asset names.
 * The sessionStorage timestamp stops a reload loop when a reload does not
 * fix it (the failure is then something else, and it is reported instead)
 * — while a stamp older than RELOAD_WINDOW_MS re-arms the tab, so the
 * long-lived tab this exists for also survives the deploy after next.
 */
let listener: AbortController | null = null;

export const installPreloadErrorRecovery = (): void => {
  // Idempotent: a second install replaces the first listener instead of
  // stacking a duplicate.
  listener?.abort();
  listener = new AbortController();

  window.addEventListener(
    'vite:preloadError',
    (event) => {
      // Checked at error time, not install time: the recovered page keeps
      // its fresh stamp for the whole window, but must be armed again by
      // the time the next deploy lands under it.
      if (reloadedRecently()) {
        // Reloading did not fix it — not a stale deploy, so let the error
        // propagate to the route boundary and say what happened.
        captureMessage('Chunk load still failing after a recovery reload', {
          level: 'warning',
        });
        return;
      }
      // No stamp means no loop guard: let the error propagate instead of
      // starting a reload that nothing can stop from repeating.
      if (!stampReload()) return;
      // Recovered deliberately: stop Vite from also throwing the error.
      event.preventDefault();
      window.location.reload();
    },
    { signal: listener.signal },
  );
};
