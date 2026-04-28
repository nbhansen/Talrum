import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const signInWithOtpMock = vi.fn();
const verifyOtpMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { signInWithOtp: signInWithOtpMock, verifyOtp: verifyOtpMock },
  },
}));

const { useEmailOtp } = await import('./login');

afterEach(() => {
  signInWithOtpMock.mockReset();
  verifyOtpMock.mockReset();
});

describe('useEmailOtp.sendCode', () => {
  it('passes the email through to signInWithOtp with shouldCreateUser', async () => {
    signInWithOtpMock.mockResolvedValueOnce({ error: null });
    const { result } = renderHook(() => useEmailOtp());
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
    const { result } = renderHook(() => useEmailOtp());
    let ok = true;
    await act(async () => {
      ok = await result.current.sendCode('parent@example.com');
    });
    expect(ok).toBe(false);
    expect(result.current.error).toBe('rate limit hit');
  });
});

describe('useEmailOtp.verify', () => {
  it('passes email and code through to verifyOtp with type "email"', async () => {
    verifyOtpMock.mockResolvedValueOnce({ error: null });
    const { result } = renderHook(() => useEmailOtp());
    let ok = false;
    await act(async () => {
      ok = await result.current.verify('parent@example.com', '123456');
    });
    expect(ok).toBe(true);
    expect(verifyOtpMock).toHaveBeenCalledWith({
      email: 'parent@example.com',
      token: '123456',
      type: 'email',
    });
  });

  it('captures the error message and returns false on failure', async () => {
    verifyOtpMock.mockResolvedValueOnce({ error: { message: 'invalid code' } });
    const { result } = renderHook(() => useEmailOtp());
    let ok = true;
    await act(async () => {
      ok = await result.current.verify('parent@example.com', '000000');
    });
    expect(ok).toBe(false);
    expect(result.current.error).toBe('invalid code');
  });
});

describe('useEmailOtp.resetError', () => {
  it('clears a previously set error', async () => {
    signInWithOtpMock.mockResolvedValueOnce({ error: { message: 'boom' } });
    const { result } = renderHook(() => useEmailOtp());
    await act(async () => {
      await result.current.sendCode('parent@example.com');
    });
    expect(result.current.error).toBe('boom');
    act(() => result.current.resetError());
    expect(result.current.error).toBeNull();
  });
});
