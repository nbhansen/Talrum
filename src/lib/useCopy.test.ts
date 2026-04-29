import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCopy } from './useCopy';

const realClipboard = navigator.clipboard;
const realIsSecure = window.isSecureContext;

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', { value: realClipboard, configurable: true });
  Object.defineProperty(window, 'isSecureContext', { value: realIsSecure, configurable: true });
  vi.useRealTimers();
});

describe('useCopy', () => {
  it('writes to the clipboard and flips `copied` true for 1.5s, then back to false', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    vi.useFakeTimers();

    const { result } = renderHook(() => useCopy());
    await act(async () => {
      result.current.copy('hello');
    });
    expect(writeText).toHaveBeenCalledWith('hello');
    expect(result.current.copied).toBe(true);
    expect(result.current.error).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current.copied).toBe(false);
  });

  it('sets the fallback error when running in an insecure context', () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    const { result } = renderHook(() => useCopy());
    act(() => {
      result.current.copy('hello');
    });
    expect(result.current.error).toMatch(/select the ID and copy manually/i);
    expect(result.current.copied).toBe(false);
  });

  it('sets the fallback error when navigator.clipboard is missing', () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const { result } = renderHook(() => useCopy());
    act(() => {
      result.current.copy('hello');
    });
    expect(result.current.error).toMatch(/select the ID and copy manually/i);
  });

  it('sets the fallback error when writeText rejects', async () => {
    const writeText = vi.fn(() => Promise.reject(new Error('denied')));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { result } = renderHook(() => useCopy());
    await act(async () => {
      result.current.copy('hello');
    });
    expect(result.current.error).toMatch(/select the ID and copy manually/i);
    expect(result.current.copied).toBe(false);
  });
});
