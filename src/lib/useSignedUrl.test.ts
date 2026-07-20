import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { signedUrlFor } from './storage';
import { useSignedUrl } from './useSignedUrl';

// The signing machinery (mem/IDB caches, mint fallbacks) has its own tests in
// storage.test.ts — here the unit is the hook's state machine around it.
vi.mock('./storage', () => ({
  signedUrlFor: vi.fn(),
}));

const signMock = vi.mocked(signedUrlFor);

interface Deferred {
  promise: Promise<string>;
  resolve: (url: string) => void;
  reject: (err: Error) => void;
}

const deferred = (): Deferred => {
  let resolve: (url: string) => void = () => {
    throw new Error('resolver not assigned');
  };
  let reject: (err: Error) => void = () => {
    throw new Error('rejecter not assigned');
  };
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  signMock.mockReset();
});

describe('useSignedUrl', () => {
  it('returns null while the URL is being signed, then the signed URL', async () => {
    const d = deferred();
    signMock.mockReturnValue(d.promise);

    const { result } = renderHook(() => useSignedUrl('pictogram-images', 'owner/p1.jpg'));

    expect(result.current).toBeNull();
    expect(signMock).toHaveBeenCalledWith('pictogram-images', 'owner/p1.jpg');

    act(() => d.resolve('https://signed/p1'));
    await waitFor(() => expect(result.current).toBe('https://signed/p1'));
  });

  it('returns null and never calls the signer for an undefined path', () => {
    const { result } = renderHook(() => useSignedUrl('pictogram-images', undefined));

    expect(result.current).toBeNull();
    expect(signMock).not.toHaveBeenCalled();
  });

  it('stays null when signing fails (caller renders a placeholder)', async () => {
    const d = deferred();
    signMock.mockReturnValue(d.promise);

    const { result } = renderHook(() => useSignedUrl('pictogram-images', 'owner/p1.jpg'));

    act(() => d.reject(new Error('offline')));
    // Give the rejection a tick to propagate; the hook must swallow it.
    await act(() => Promise.resolve());
    expect(result.current).toBeNull();
  });

  it('resets to null immediately on path change so no stale URL flashes', async () => {
    const first = deferred();
    const second = deferred();
    signMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook(({ path }) => useSignedUrl('pictogram-images', path), {
      initialProps: { path: 'owner/p1.jpg' },
    });
    act(() => first.resolve('https://signed/p1'));
    await waitFor(() => expect(result.current).toBe('https://signed/p1'));

    rerender({ path: 'owner/p2.jpg' });

    expect(result.current).toBeNull();
    act(() => second.resolve('https://signed/p2'));
    await waitFor(() => expect(result.current).toBe('https://signed/p2'));
  });

  it('ignores a late resolution from a path that was switched away from', async () => {
    const first = deferred();
    const second = deferred();
    signMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook(({ path }) => useSignedUrl('pictogram-images', path), {
      initialProps: { path: 'owner/p1.jpg' },
    });
    rerender({ path: 'owner/p2.jpg' });

    act(() => second.resolve('https://signed/p2'));
    await waitFor(() => expect(result.current).toBe('https://signed/p2'));

    // The abandoned first fetch answers last — it must not win.
    act(() => first.resolve('https://signed/p1'));
    await act(() => Promise.resolve());
    expect(result.current).toBe('https://signed/p2');
  });

  it('clears back to null when the path becomes undefined', async () => {
    const d = deferred();
    signMock.mockReturnValue(d.promise);

    const { result, rerender } = renderHook(
      ({ path }: { path: string | undefined }) => useSignedUrl('pictogram-images', path),
      { initialProps: { path: 'owner/p1.jpg' as string | undefined } },
    );
    act(() => d.resolve('https://signed/p1'));
    await waitFor(() => expect(result.current).toBe('https://signed/p1'));

    rerender({ path: undefined });

    expect(result.current).toBeNull();
  });
});
