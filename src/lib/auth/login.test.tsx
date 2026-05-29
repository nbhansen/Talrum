import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const signInWithOtpMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { signInWithOtp: signInWithOtpMock },
  },
}));

const { useMagicLink } = await import('./login');

afterEach(() => {
  signInWithOtpMock.mockReset();
});

describe('useMagicLink.sendLink', () => {
  it('sends a magic link with shouldCreateUser and a redirect back to the app', async () => {
    signInWithOtpMock.mockResolvedValueOnce({ error: null });
    const { result } = renderHook(() => useMagicLink());
    let ok = false;
    await act(async () => {
      ok = await result.current.sendLink('parent@example.com');
    });
    expect(ok).toBe(true);
    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: 'parent@example.com',
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
    });
    expect(result.current.error).toBeNull();
  });

  it('captures the error message and returns false on failure', async () => {
    signInWithOtpMock.mockResolvedValueOnce({ error: { message: 'rate limit hit' } });
    const { result } = renderHook(() => useMagicLink());
    let ok = true;
    await act(async () => {
      ok = await result.current.sendLink('parent@example.com');
    });
    expect(ok).toBe(false);
    expect(result.current.error).toBe('rate limit hit');
  });
});

describe('useMagicLink.resetError', () => {
  it('clears a previously set error', async () => {
    signInWithOtpMock.mockResolvedValueOnce({ error: { message: 'boom' } });
    const { result } = renderHook(() => useMagicLink());
    await act(async () => {
      await result.current.sendLink('parent@example.com');
    });
    expect(result.current.error).toBe('boom');
    act(() => result.current.resetError());
    expect(result.current.error).toBeNull();
  });
});
