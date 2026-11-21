/**
 * Parent PIN, hashed before it reaches localStorage. A soft gate against a
 * child leaving kid mode, not against devtools.
 */
import { storageSignal } from './storageSignal';

const STORAGE_KEY = 'talrum:pin-hash';

// Dev-only so the flag can never bypass kid mode in a production build (#365).
export const pinGateDisabled = (): boolean =>
  import.meta.env.DEV && import.meta.env.VITE_DISABLE_PIN === '1';

const signal = storageSignal(STORAGE_KEY);

/** For useSyncExternalStore over hasPin(). */
export const subscribePin = signal.subscribe;

const toHex = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

const hashPin = async (pin: string): Promise<string> => {
  const data = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(digest);
};

// Blocked storage reads as "no PIN", so kid mode fails closed to PIN setup.
const readHash = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

export const hasPin = (): boolean => {
  if (pinGateDisabled()) return true;
  return readHash() !== null;
};

export const setPin = async (pin: string): Promise<void> => {
  localStorage.setItem(STORAGE_KEY, await hashPin(pin));
  signal.notify();
};

export const verifyPin = async (pin: string): Promise<boolean> => {
  if (pinGateDisabled()) return true;
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
  signal.notify();
};
