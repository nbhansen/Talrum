import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const signOutMock = vi.fn(() => Promise.resolve({ error: null }));

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signOut: signOutMock } },
}));

const { useSession, useSessionUser, useSignOut } = await import('./session');
const { TestSessionProvider } = await import('./session.test-utils');

describe('session hooks', () => {
  it('useSession exposes the provided Session', () => {
    const { result } = renderHook(() => useSession(), { wrapper: TestSessionProvider });
    expect(result.current.access_token).toBe('fake');
  });

  it('useSessionUser exposes the user', () => {
    const { result } = renderHook(() => useSessionUser(), { wrapper: TestSessionProvider });
    expect(result.current.email).toBe('parent@example.com');
  });

  it('useSignOut calls supabase.auth.signOut', async () => {
    const { result } = renderHook(() => useSignOut(), { wrapper: TestSessionProvider });
    await result.current();
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it('throws when used outside SessionProvider', () => {
    // Suppress the error boundary noise React logs for a thrown render.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useSession())).toThrow(/outside SessionProvider/);
    spy.mockRestore();
  });
});
