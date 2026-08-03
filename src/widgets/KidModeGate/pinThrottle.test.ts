import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getPinLockedUntil, recordPinFailure, resetPinThrottle } from './pinThrottle';

const T0 = 1_700_000_000_000;

beforeEach(() => {
  vi.useFakeTimers({ now: T0 });
  resetPinThrottle();
});

afterEach(() => {
  resetPinThrottle();
  vi.useRealTimers();
});

const fail = (times: number): void => {
  for (let i = 0; i < times; i++) recordPinFailure();
};

describe('pinThrottle (#372)', () => {
  it('does not lock before the 5th wrong entry', () => {
    fail(4);
    expect(getPinLockedUntil()).toBe(0);
  });

  it('locks for 30s on the 5th wrong entry', () => {
    fail(5);
    expect(getPinLockedUntil()).toBe(T0 + 30_000);
  });

  it('doubles per group of 5, capped at 5 minutes', () => {
    fail(10);
    expect(getPinLockedUntil()).toBe(T0 + 60_000);
    fail(5);
    expect(getPinLockedUntil()).toBe(T0 + 120_000);
    fail(5);
    expect(getPinLockedUntil()).toBe(T0 + 240_000);
    fail(5);
    expect(getPinLockedUntil()).toBe(T0 + 300_000);
    fail(5);
    expect(getPinLockedUntil()).toBe(T0 + 300_000);
  });

  it('a correct PIN resets the escalation, not just the lock', () => {
    fail(5);
    resetPinThrottle();
    expect(getPinLockedUntil()).toBe(0);
    // Back to the first tier: the next lock is 30s again, not 60s.
    fail(5);
    expect(getPinLockedUntil()).toBe(T0 + 30_000);
  });
});
