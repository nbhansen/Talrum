/**
 * Parent PIN, hashed before it reaches localStorage. A soft gate against a
 * child leaving kid mode, not against devtools.
 */

const STORAGE_KEY = 'talrum:pin-hash';

// Dev-only so the flag can never bypass kid mode in a production build (#365).
const isDisabled = (): boolean => import.meta.env.DEV && import.meta.env.VITE_DISABLE_PIN === '1';

const listeners = new Set<() => void>();

const notify = (): void => {
  for (const cb of listeners) cb();
};

/** For useSyncExternalStore over hasPin(). Also fires for a change made in another tab. */
export const subscribePin = (cb: () => void): (() => void) => {
  listeners.add(cb);
  const onStorage = (event: StorageEvent): void => {
    if (event.key === STORAGE_KEY || event.key === null) cb();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
};

const toHex = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

const hashPin = async (pin: string): Promise<string> => {
  const data = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(digest);
};

export const pinGateDisabled = (): boolean => isDisabled();

// Blocked storage reads as "no PIN", so kid mode fails closed to PIN setup.
const readHash = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

export const hasPin = (): boolean => {
  if (isDisabled()) return true;
  return readHash() !== null;
};

/**
 * A device with no PIN must not enter kid mode at all (#353). False in builds
 * with the gate disabled, where `hasPin()` reports true.
 */
export const kidModeNeedsPinSetup = (): boolean => !hasPin();

export const setPin = async (pin: string): Promise<void> => {
  localStorage.setItem(STORAGE_KEY, await hashPin(pin));
  notify();
};

export const verifyPin = async (pin: string): Promise<boolean> => {
  if (isDisabled()) return true;
  const stored = readHash();
  if (!stored) return false;
  return (await hashPin(pin)) === stored;
};

export const clearPin = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Blocked storage: nothing to clear, and the sign-out sweep must go on.
  }
  notify();
};
