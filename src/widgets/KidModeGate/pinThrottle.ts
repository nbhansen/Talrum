/**
 * Escalating cooldown for wrong PIN entries at the kid-mode exit (#372).
 * Every 5th wrong entry locks the pad: 30s, then 60s, doubling up to a
 * 5-minute cap. The PIN is a soft gate (see src/lib/pin.ts) — the adversary
 * here is an older sibling with ten minutes, not an attacker with devtools.
 *
 * The state is module-scoped and deliberately NOT persisted:
 *   - Module scope, not component state: the counter must survive closing
 *     and reopening the pad (a free reset would defeat the throttle) and is
 *     shared by both exit surfaces (KidModeGate, KidRouteFallback).
 *   - Not persisted: surviving a reload would turn a forgotten PIN into a
 *     device lockout. The parent can always clear the PIN from Settings.
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
