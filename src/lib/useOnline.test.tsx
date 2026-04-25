import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useOnline } from './useOnline';

const setOnline = (online: boolean): void => {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
};

afterEach(() => {
  setOnline(true);
});

describe('useOnline', () => {
  it('reflects navigator.onLine on mount', () => {
    setOnline(false);
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(false);
  });

  it('flips on online/offline events', () => {
    setOnline(true);
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(true);
  });
});
