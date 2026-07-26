import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearPin, hasPin, kidModeNeedsPinSetup, setPin, verifyPin } from './pin';

beforeEach(() => {
  window.localStorage.removeItem('talrum:pin-hash');
});

describe('pin', () => {
  it('round-trips: set, verify, clear', async () => {
    expect(hasPin()).toBe(false);
    await setPin('1234');
    expect(hasPin()).toBe(true);
    expect(await verifyPin('1234')).toBe(true);
    expect(await verifyPin('4321')).toBe(false);
    clearPin();
    expect(hasPin()).toBe(false);
    expect(await verifyPin('1234')).toBe(false);
  });

  it('stores a hash, never the PIN itself', async () => {
    await setPin('4242');
    const stored = localStorage.getItem('talrum:pin-hash');
    expect(stored).toBeTruthy();
    expect(stored).not.toBe('4242');
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
  });

  describe('kidModeNeedsPinSetup (#353)', () => {
    it('is true until a PIN exists, and false again once it is cleared', async () => {
      expect(kidModeNeedsPinSetup()).toBe(true);
      await setPin('1234');
      expect(kidModeNeedsPinSetup()).toBe(false);
      clearPin();
      expect(kidModeNeedsPinSetup()).toBe(true);
    });

    // Builds with the gate disabled must not be locked out of kid mode: the
    // route guard reads this, and hasPin() reports true when disabled.
    it('is false in builds with the PIN gate disabled', () => {
      vi.stubEnv('VITE_DISABLE_PIN', '1');
      try {
        expect(kidModeNeedsPinSetup()).toBe(false);
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });
});
