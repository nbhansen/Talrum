/**
 * Escalating cooldown for wrong PIN entries at the kid-mode exit (#372). The
 * adversary is an older sibling with ten minutes, not devtools. Module scope,
 * so closing the pad is not a free reset; not persisted, so a forgotten PIN
 * cannot become a device lockout.
 */

const GROUP_SIZE = 5;
const BASE_LOCK_MS = 30_000;
/** Exported for PinPad's display clamp: no countdown may claim more than this. */
export const MAX_LOCK_MS = 5 * 60_000;

let failCount = 0;
let lockedUntil = 0;
const listeners = new Set<() => void>();

const notify = (): void => {
  for (const cb of listeners) cb();
};

export const subscribePinThrottle = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

/** Epoch ms until which PIN entry is locked; 0 when unlocked. */
export const getPinLockedUntil = (): number => lockedUntil;

export const recordPinFailure = (): void => {
  failCount += 1;
  if (failCount % GROUP_SIZE !== 0) return;
  const doublings = failCount / GROUP_SIZE - 1;
  lockedUntil = Date.now() + Math.min(BASE_LOCK_MS * 2 ** doublings, MAX_LOCK_MS);
  notify();
};

/** Called on a correct PIN; also the per-test reset. */
export const resetPinThrottle = (): void => {
  failCount = 0;
  lockedUntil = 0;
  notify();
};
