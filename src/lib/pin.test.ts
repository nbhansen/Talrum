import { describe, expect, it, vi } from 'vitest';

import { clearPin, hasPin, pinGateDisabled, setPin, subscribePin, verifyPin } from './pin';

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

  it('ignores VITE_DISABLE_PIN outside a dev build (#365)', () => {
    vi.stubEnv('VITE_DISABLE_PIN', '1');
    vi.stubEnv('DEV', false);
    try {
      expect(pinGateDisabled()).toBe(false);
      expect(hasPin()).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  // Builds with the gate disabled must not be locked out of kid mode: the
  // route guard reads hasPin().
  it('reports a PIN in builds with the PIN gate disabled', () => {
    vi.stubEnv('VITE_DISABLE_PIN', '1');
    try {
      expect(hasPin()).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('notifies subscribers when the PIN is set and when it is cleared', async () => {
    const cb = vi.fn();
    const unsubscribe = subscribePin(cb);
    await setPin('1234');
    clearPin();
    unsubscribe();
    expect(cb).toHaveBeenCalledTimes(2);
  });
});
