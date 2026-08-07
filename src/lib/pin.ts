/**
 * Parent PIN, hashed before it reaches localStorage. A soft gate against a
 * child leaving kid mode, not against devtools.
 */

const STORAGE_KEY = 'talrum:pin-hash';

const isDisabled = (): boolean => import.meta.env.VITE_DISABLE_PIN === '1';

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

export const hasPin = (): boolean => {
  if (isDisabled()) return true;
  return localStorage.getItem(STORAGE_KEY) !== null;
};

/**
 * A device with no PIN must not enter kid mode at all (#353). False in builds
 * with the gate disabled, where `hasPin()` reports true.
 */
export const kidModeNeedsPinSetup = (): boolean => !hasPin();

export const setPin = async (pin: string): Promise<void> => {
  localStorage.setItem(STORAGE_KEY, await hashPin(pin));
};

export const verifyPin = async (pin: string): Promise<boolean> => {
  if (isDisabled()) return true;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return false;
  return (await hashPin(pin)) === stored;
};

export const clearPin = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};
