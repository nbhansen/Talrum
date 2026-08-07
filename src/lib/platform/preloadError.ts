import { captureMessage } from './telemetry';

const RELOADED_AT = 'talrum-preload-reloaded';
const RELOAD_COUNT = 'talrum-preload-reload-count';

// A recovery reload lands within seconds, so a younger stamp means the reload
// did not fix the failure.
const RELOAD_WINDOW_MS = 30_000;

// The stamp alone misses a loop whose round trip outlasts it — a chunk request
// that stalls until the browser gives up — so cap the reloads too (#443).
const BURST_WINDOW_MS = 10 * 60_000;
const MAX_RELOADS = 3;

interface Recovery {
  age: number;
  reloads: number;
}

// Null when sessionStorage is blocked (privacy mode). That stays its own state:
// such a browser never reloaded, so reporting it as "still failing after a
// recovery reload" would read in Sentry as the fix not working.
const readRecovery = (): Recovery | null => {
  try {
    const at = Number(sessionStorage.getItem(RELOADED_AT));
    const age = at > 0 ? Date.now() - at : Infinity;
    // A stamp older than the burst window is a previous deploy's recovery, not
    // a loop: the tab is armed again and the count starts over.
    const reloads = age < BURST_WINDOW_MS ? Number(sessionStorage.getItem(RELOAD_COUNT)) || 0 : 0;
    return { age, reloads };
  } catch {
    return null;
  }
};

const writeRecovery = (reloads: number): boolean => {
  try {
    // Count first, because the two writes are not atomic. A count with no
    // stamp is harmless; a stamp with no count claims a reload that never
    // happened and mislabels the next 30 seconds of failures.
    sessionStorage.setItem(RELOAD_COUNT, String(reloads));
    sessionStorage.setItem(RELOADED_AT, String(Date.now()));
    return true;
  } catch {
    return false;
  }
};

// `payload` names the asset that failed and carries no board or kid content.
// Without it every warning below is a constant string (#442).
const warn = (message: string, event: Event): void => {
  const payload: unknown = (event as Event & { payload?: unknown }).payload;
  captureMessage(message, {
    level: 'warning',
    extra: { reason: payload instanceof Error ? `${payload.name}: ${payload.message}` : 'unknown' },
  });
};

let listener: AbortController | null = null;

// `reload()` does not stop the current document, so a second failure before
// the navigation commits is the recovery in flight, not a failed recovery.
let reloading = false;

/**
 * Recovers from a deploy landing under an open tab (#442): the hashed chunks it
 * asks for are gone from the server and from the precache, so one reload gets
 * the current `index.html`. The event's default is deliberately not prevented —
 * that makes the failed import resolve `undefined` and hides the real error.
 */
export const installPreloadErrorRecovery = (): void => {
  // A second install replaces the listener rather than stacking a duplicate.
  // A fresh install means a fresh document, so no reload is in flight.
  listener?.abort();
  listener = new AbortController();
  reloading = false;

  window.addEventListener(
    'vite:preloadError',
    (event) => {
      // Reporting here would say the fix does not work while it is working.
      if (reloading) return;

      // Offline a reload cannot fetch the chunk, and it may trade the running
      // app for a browser error page. The route boundary offers the reload
      // instead. Only the false value of `onLine` is reliable, so the recovery
      // itself is not gated on it.
      if (!navigator.onLine) return;

      // Read at error time: the recovered page keeps a fresh stamp for the
      // whole window but must be armed again for the next deploy.
      const recovery = readRecovery();
      if (recovery === null) {
        // No storage means no loop guard.
        warn('Chunk load failed with storage blocked — cannot auto-reload', event);
        return;
      }
      if (recovery.age < RELOAD_WINDOW_MS) {
        // Reloading did not fix it, so this is not a stale deploy.
        warn('Chunk load still failing after a recovery reload', event);
        return;
      }
      if (recovery.reloads >= MAX_RELOADS) {
        // The count cannot tell a slow loop from a run of deploys that each
        // recovered, so the message claims only that the cap was reached.
        warn(`Chunk load reload cap reached — ${MAX_RELOADS} inside the burst window`, event);
        return;
      }
      // Stamp first: a reload with no written guard could repeat forever. A
      // working getItem beside a throwing setItem has no other signal.
      if (!writeRecovery(recovery.reloads + 1)) {
        warn('Chunk load failed — could not persist the reload guard', event);
        return;
      }
      reloading = true;
      window.location.reload();
    },
    { signal: listener.signal },
  );
};
