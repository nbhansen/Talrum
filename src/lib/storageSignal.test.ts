import { describe, expect, it, vi } from 'vitest';

import { storageSignal } from './storageSignal';

describe('storageSignal', () => {
  it('notifies on a same-tab write', () => {
    const signal = storageSignal('talrum:some-key');
    const cb = vi.fn();
    const unsubscribe = signal.subscribe(cb);
    signal.notify();
    unsubscribe();
    signal.notify();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('notifies when another tab clears all storage', () => {
    const cb = vi.fn();
    const unsubscribe = storageSignal('talrum:some-key').subscribe(cb);
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    unsubscribe();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('ignores a storage event for another key', () => {
    const cb = vi.fn();
    const unsubscribe = storageSignal('talrum:some-key').subscribe(cb);
    window.dispatchEvent(new StorageEvent('storage', { key: 'talrum:other-key' }));
    unsubscribe();
    expect(cb).not.toHaveBeenCalled();
  });
});
