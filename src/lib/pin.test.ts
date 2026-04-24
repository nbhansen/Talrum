import { beforeEach, describe, expect, it } from 'vitest';

import { clearPin, hasPin, setPin, verifyPin } from './pin';

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
});
