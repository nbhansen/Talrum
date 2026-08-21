import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const signInWithOtpMock = vi.fn();
const verifyOtpMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { signInWithOtp: signInWithOtpMock, verifyOtp: verifyOtpMock },
  },
}));

const { useEmailCode } = await import('./login');

afterEach(() => {
  signInWithOtpMock.mockReset();
  verifyOtpMock.mockReset();
});

describe('useEmailCode.sendCode', () => {
  it('sends a code email with shouldCreateUser', async () => {
    signInWithOtpMock.mockResolvedValueOnce({ error: null });
    const { result } = renderHook(() => useEmailCode());
    let ok = false;
    await act(async () => {
      ok = await result.current.sendCode('parent@example.com');
    });
    expect(ok).toBe(true);
    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: 'parent@example.com',
      options: { shouldCreateUser: true },
    });
    expect(result.current.error).toBeNull();
  });

  it('captures the error message and returns false on failure', async () => {
    signInWithOtpMock.mockResolvedValueOnce({ error: { message: 'rate limit hit' } });
    const { result } = renderHook(() => useEmailCode());
    let ok = true;
    await act(async () => {
      ok = await result.current.sendCode('parent@example.com');
    });
    expect(ok).toBe(false);
    expect(result.current.error).toBe('rate limit hit');
  });
});

describe('useEmailCode.verifyCode', () => {
  it('verifies the typed code as an email OTP and returns true', async () => {
    verifyOtpMock.mockResolvedValueOnce({ error: null });
    const { result } = renderHook(() => useEmailCode());
    let ok = false;
    await act(async () => {
      ok = await result.current.verifyCode('parent@example.com', '123456');
    });
    expect(ok).toBe(true);
    expect(verifyOtpMock).toHaveBeenCalledWith({
      email: 'parent@example.com',
      token: '123456',
      type: 'email',
    });
    expect(result.current.error).toBeNull();
  });

  it('captures the error message and returns false on a wrong code', async () => {
    verifyOtpMock.mockResolvedValueOnce({ error: { message: 'Token has expired or is invalid' } });
    const { result } = renderHook(() => useEmailCode());
    let ok = true;
    await act(async () => {
      ok = await result.current.verifyCode('parent@example.com', '000000');
    });
    expect(ok).toBe(false);
    expect(result.current.error).toBe('Token has expired or is invalid');
  });
});

describe('useEmailCode.resetError', () => {
  it('clears a previously set error', async () => {
    signInWithOtpMock.mockResolvedValueOnce({ error: { message: 'boom' } });
    const { result } = renderHook(() => useEmailCode());
    await act(async () => {
      await result.current.sendCode('parent@example.com');
    });
    expect(result.current.error).toBe('boom');
    act(() => result.current.resetError());
    expect(result.current.error).toBeNull();
  });
});
