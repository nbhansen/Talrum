import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/platform/telemetry', () => ({ captureException: vi.fn() }));
const telemetry = await import('@/lib/platform/telemetry');
const { setActiveKidId, subscribeActiveKid } = await import('./activeKid');

beforeEach(() => {
  vi.mocked(telemetry.captureException).mockClear();
});

describe('subscribeActiveKid', () => {
  it('notifies on a write, and not on a write of the same value', () => {
    const cb = vi.fn();
    const unsubscribe = subscribeActiveKid(cb);
    setActiveKidId('k1');
    setActiveKidId('k1');
    unsubscribe();
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe('active-kid persistence failure reporting (#359)', () => {
  it('reports a localStorage write failure once per session and does not throw', () => {
    const quota = new Error('quota exceeded');
    // vitest.setup.ts replaces localStorage with a plain shim, so spy on the
    // object itself, not Storage.prototype.
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw quota;
    });
    try {
      expect(() => setActiveKidId('k1')).not.toThrow();
      // Latched: the block is persistent and every switcher tap writes.
      setActiveKidId('k2');
    } finally {
      spy.mockRestore();
    }
    expect(telemetry.captureException).toHaveBeenCalledExactlyOnceWith(quota, {
      level: 'warning',
      tags: { component: 'activeKid', op: 'write' },
    });
  });

  it('reports a localStorage read failure once per session and treats the id as absent', () => {
    const denied = new Error('access denied');
    const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw denied;
    });
    try {
      // The failed read yields null, which equals the requested id, so the
      // write path is never reached: only the read failure is reported.
      expect(() => setActiveKidId(null)).not.toThrow();
      // The read is a useSyncExternalStore getSnapshot and runs per render;
      // a blocked localStorage blocks persistently, so the report is latched.
      setActiveKidId(null);
    } finally {
      spy.mockRestore();
    }
    expect(telemetry.captureException).toHaveBeenCalledExactlyOnceWith(denied, {
      level: 'warning',
      tags: { component: 'activeKid', op: 'read' },
    });
  });
});
