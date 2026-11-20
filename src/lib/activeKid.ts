import { captureException } from '@/lib/platform/telemetry';

const ACTIVE_KID_KEY = 'talrum:active-kid-id';
const listeners = new Set<() => void>();

/** Same-tab writes notify via setActiveKidId; other tabs via `storage`. */
export const subscribeActiveKid = (cb: () => void): (() => void) => {
  listeners.add(cb);
  const onStorage = (event: StorageEvent): void => {
    if (event.key === ACTIVE_KID_KEY || event.key === null) cb();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
};

// A blocked localStorage blocks persistently (privacy mode, "block all
// storage"), and this read is the getSnapshot of a useSyncExternalStore —
// it runs on every render. Latch the report so the signal arrives once per
// session instead of once per render.
let reportedReadFailure = false;
let reportedWriteFailure = false;

export const getStoredActiveKidId = (): string | null => {
  try {
    return localStorage.getItem(ACTIVE_KID_KEY);
  } catch (err) {
    // Falling back to the first kid is fine for the user, but not silently:
    // this is app state, not a preference — losing it changes which boards
    // the parent sees (#359).
    if (!reportedReadFailure) {
      reportedReadFailure = true;
      captureException(err, { level: 'warning', tags: { component: 'activeKid', op: 'read' } });
    }
    return null;
  }
};

/**
 * Set the per-device active-kid id. Pass `null` to clear (e.g. when the
 * active kid is deleted — `useActiveKid` then falls back to the first kid).
 * Skips work and the fan-out when the value is unchanged so consumers don't
 * re-render on no-op writes (e.g. tapping the already-active switcher pill).
 */
export const setActiveKidId = (id: string | null): void => {
  if (getStoredActiveKidId() === id) return;
  try {
    if (id == null) localStorage.removeItem(ACTIVE_KID_KEY);
    else localStorage.setItem(ACTIVE_KID_KEY, id);
  } catch (err) {
    // Quota / privacy mode: stay best-effort for the user, but report it —
    // latched like the read path, because the block is persistent and every
    // kid-switcher tap runs this write (#359).
    if (!reportedWriteFailure) {
      reportedWriteFailure = true;
      captureException(err, { level: 'warning', tags: { component: 'activeKid', op: 'write' } });
    }
  }
  for (const cb of listeners) cb();
};
