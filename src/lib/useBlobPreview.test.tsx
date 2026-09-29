import { act, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBlobPreview } from './useBlobPreview';

let revoke: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const item = (previewUrl: string): { previewUrl: string } => ({ previewUrl });

describe('useBlobPreview', () => {
  it('revokes the old URL when a new preview replaces it', () => {
    const { result } = renderHook(() => useBlobPreview());
    act(() => result.current.show(item('blob:a')));
    act(() => result.current.show(item('blob:b')));
    expect(result.current.preview?.previewUrl).toBe('blob:b');
    expect(revoke).toHaveBeenCalledWith('blob:a');
    expect(revoke).not.toHaveBeenCalledWith('blob:b');
  });

  it('revokes the URL on clear and on unmount', () => {
    const { result, unmount } = renderHook(() => useBlobPreview());
    act(() => result.current.show(item('blob:a')));
    act(() => result.current.clear());
    expect(result.current.preview).toBeNull();
    expect(revoke).toHaveBeenCalledWith('blob:a');
    act(() => result.current.show(item('blob:b')));
    unmount();
    expect(revoke).toHaveBeenCalledWith('blob:b');
  });

  it('revokes a preview that arrives after unmount', () => {
    const { result, unmount } = renderHook(() => useBlobPreview());
    const { show } = result.current;
    unmount();
    show(item('blob:late'));
    expect(revoke).toHaveBeenCalledWith('blob:late');
  });

  // StrictMode runs setup → cleanup → setup; the guard must reopen (#433).
  it('keeps a preview under StrictMode', () => {
    const { result } = renderHook(() => useBlobPreview(), { wrapper: StrictMode });
    act(() => result.current.show(item('blob:a')));
    expect(result.current.preview?.previewUrl).toBe('blob:a');
    expect(revoke).not.toHaveBeenCalled();
  });
});
