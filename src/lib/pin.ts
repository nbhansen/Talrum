/**
 * Parent PIN stored client-side. The PIN is hashed with SHA-256 before
 * persisting — we never keep the digits themselves in localStorage.
 *
 * Threat model: this is a soft gate so a kid in kid-mode can't exit to
 * parent settings. It is not protection against a determined attacker
 * with devtools access; that would need a server-side check and real
 * auth, which arrive in Phase 3 step 5.
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
 * Kid mode is a one-way door only while a PIN exists to close it, so a device
 * without one must not enter kid mode at all (#353). Before this, the exit
 * gate offered to *create* a PIN, which let a child pick one and walk out
 * into the board builder. PINs are now set in parent UI only.
 *
 * False in builds with the gate disabled, since hasPin() reports true there.
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
