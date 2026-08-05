import { captureMessage } from './telemetry';

const RELOADED_FLAG = 'talrum-preload-reloaded';

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
 * The sessionStorage flag stops a reload loop when a reload does not fix
 * it (the failure is then something else, and it is reported instead).
 *
 * The flag is read into `alreadyReloaded` and removed at install time, in
 * that order: the page after the recovery reload must still know it came
 * from a reload (or a recurring failure would loop), while the load after
 * that starts re-armed for the next deploy.
 */
let listener: AbortController | null = null;

export const installPreloadErrorRecovery = (): void => {
  const alreadyReloaded = sessionStorage.getItem(RELOADED_FLAG) !== null;
  sessionStorage.removeItem(RELOADED_FLAG);

  // Idempotent: a second install replaces the first listener instead of
  // stacking a duplicate.
  listener?.abort();
  listener = new AbortController();

  window.addEventListener(
    'vite:preloadError',
    (event) => {
      if (alreadyReloaded) {
        // Reloading did not fix it — not a stale deploy, so let the error
        // propagate to the route boundary and say what happened.
        captureMessage('Chunk load still failing after a recovery reload', {
          level: 'warning',
        });
        return;
      }
      sessionStorage.setItem(RELOADED_FLAG, 'true');
      // Recovered deliberately: stop Vite from also throwing the error.
      event.preventDefault();
      window.location.reload();
    },
    { signal: listener.signal },
  );
};
