import type { Session } from '@supabase/supabase-js';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getSessionMock = vi.fn();
type AuthChangeListener = (event: string, session: Session | null) => void;
let lastAuthListener: AuthChangeListener | null = null;
const onAuthStateChangeMock = vi.fn((listener: AuthChangeListener) => {
  lastAuthListener = listener;
  return { data: { subscription: { unsubscribe: vi.fn() } } };
});

const makeSession = (id: string, email: string): Session =>
  ({
    access_token: `token-${id}`,
    refresh_token: 'r',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id,
      email,
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-04-01T00:00:00Z',
    },
  }) as Session;

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
      onAuthStateChange: onAuthStateChangeMock,
    },
  },
}));

vi.mock('@/features/login/Login', () => ({
  Login: (): JSX.Element => <div>login screen</div>,
}));

const { AuthGate } = await import('./AuthGate');
const { useSessionUser } = await import('@/lib/auth/session');

const UserIdProbe = (): JSX.Element => <div data-testid="probe-user-id">{useSessionUser().id}</div>;

afterEach(() => {
  getSessionMock.mockReset();
  onAuthStateChangeMock.mockClear();
  window.localStorage.clear();
});

describe('AuthGate', () => {
  it('shows the loading copy while getSession is pending', () => {
    getSessionMock.mockReturnValueOnce(new Promise(() => undefined));
    render(
      <AuthGate>
        <div>app body</div>
      </AuthGate>,
    );
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText('app body')).not.toBeInTheDocument();
  });

  it('shows an error screen with Retry when getSession rejects', async () => {
    getSessionMock.mockRejectedValueOnce(new Error('fetch failed: net::ERR'));
    render(
      <AuthGate>
        <div>app body</div>
      </AuthGate>,
    );
    await waitFor(() => {
      expect(screen.getByText('Could not reach the server')).toBeInTheDocument();
    });
    expect(screen.getByText('fetch failed: net::ERR')).toBeInTheDocument();
    expect(screen.queryByText('app body')).not.toBeInTheDocument();

    getSessionMock.mockResolvedValueOnce({ data: { session: null } });
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(screen.getByText('login screen')).toBeInTheDocument();
    });
  });

  it('swaps the spinner for an offline hint after 5s if getSession hangs while offline (#30)', async () => {
    const originalOnline = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    getSessionMock.mockReturnValueOnce(new Promise(() => undefined));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(
        <AuthGate>
          <div>app body</div>
        </AuthGate>,
      );
      // Spinner is up before the hung-getSession timer fires.
      expect(screen.getByText('Loading…')).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      await waitFor(() => {
        expect(screen.getByText("You're offline")).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
      Object.defineProperty(navigator, 'onLine', { value: originalOnline, configurable: true });
    }
  });

  it('renders children (not Login) when out and on a public path', async () => {
    const originalPath = window.location.pathname;
    history.replaceState(null, '', '/account-deleted');
    getSessionMock.mockResolvedValueOnce({ data: { session: null } });
    try {
      render(
        <AuthGate>
          <div data-testid="public-child">deleted page</div>
        </AuthGate>,
      );
      await waitFor(() => {
        expect(screen.getByTestId('public-child')).toBeInTheDocument();
      });
      expect(screen.queryByText('login screen')).not.toBeInTheDocument();
    } finally {
      history.replaceState(null, '', originalPath);
    }
  });

  // Belt-and-braces: if a CDN rewrite, copy-pasted URL, or a router quirk
  // sticks a trailing slash on the path, the public-path lookup must still
  // match. Without normalization signed-out users would bounce to Login.
  it('renders children (not Login) when out and on a public path with trailing slash', async () => {
    const originalPath = window.location.pathname;
    history.replaceState(null, '', '/account-deleted/');
    getSessionMock.mockResolvedValueOnce({ data: { session: null } });
    try {
      render(
        <AuthGate>
          <div data-testid="public-child">deleted page</div>
        </AuthGate>,
      );
      await waitFor(() => {
        expect(screen.getByTestId('public-child')).toBeInTheDocument();
      });
      expect(screen.queryByText('login screen')).not.toBeInTheDocument();
    } finally {
      history.replaceState(null, '', originalPath);
    }
  });

  // Regression for the deletion flow end-to-end behaviour: the user was
  // signed in, navigated to /account-deleted, and then signOut() fires.
  // AuthGate's onAuthStateChange listener flips state to 'out' — and at
  // that moment the PUBLIC_PATHS branch must keep rendering children, not
  // bounce to <Login />. This test fails if anyone removes the
  // PUBLIC_PATHS check from the `out` branch.
  it('keeps showing children on /account-deleted when SIGNED_OUT fires after navigation', async () => {
    const originalPath = window.location.pathname;
    history.replaceState(null, '', '/account-deleted');
    const sessionA = makeSession('user-a-id', 'a@example.com');
    getSessionMock.mockResolvedValueOnce({ data: { session: sessionA } });
    try {
      render(
        <AuthGate>
          <div data-testid="public-children">deleted page</div>
        </AuthGate>,
      );
      // Signed-in: SessionProvider mounts, children render.
      await waitFor(() => {
        expect(screen.getByTestId('public-children')).toBeInTheDocument();
      });

      // signOut() flips state to 'out'. PUBLIC_PATHS catches the path
      // and we keep rendering children instead of <Login />.
      act(() => {
        lastAuthListener?.('SIGNED_OUT', null);
      });
      await waitFor(() => {
        expect(screen.getByTestId('public-children')).toBeInTheDocument();
      });
      expect(screen.queryByText('login screen')).not.toBeInTheDocument();
    } finally {
      history.replaceState(null, '', originalPath);
    }
  });

  it('still shows Login when out and on a non-public path', async () => {
    const originalPath = window.location.pathname;
    history.replaceState(null, '', '/');
    getSessionMock.mockResolvedValueOnce({ data: { session: null } });
    try {
      render(
        <AuthGate>
          <div data-testid="public-child">should not render</div>
        </AuthGate>,
      );
      await waitFor(() => {
        expect(screen.getByText('login screen')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('public-child')).not.toBeInTheDocument();
    } finally {
      history.replaceState(null, '', originalPath);
    }
  });

  // Regression cover for cross-user re-auth: signing out and back in as a
  // different user must propagate the new user.id all the way through
  // SessionProvider so dependent hooks (mutations, useUserInitial) read the
  // new user. Verifies AuthGate wires onAuthStateChange → setState →
  // SessionProvider value without missing a session swap.
  it('propagates a new session.user when onAuthStateChange fires after re-auth', async () => {
    const sessionA = makeSession('user-a-id', 'a@example.com');
    const sessionB = makeSession('user-b-id', 'b@example.com');
    getSessionMock.mockResolvedValueOnce({ data: { session: sessionA } });
    render(
      <AuthGate>
        <UserIdProbe />
      </AuthGate>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('probe-user-id')).toHaveTextContent('user-a-id');
    });

    act(() => {
      lastAuthListener?.('SIGNED_OUT', null);
    });
    await waitFor(() => {
      expect(screen.getByText('login screen')).toBeInTheDocument();
    });

    act(() => {
      lastAuthListener?.('SIGNED_IN', sessionB);
    });
    await waitFor(() => {
      expect(screen.getByTestId('probe-user-id')).toHaveTextContent('user-b-id');
    });
  });

  // #178: PIN hash and last-board pointer live in localStorage and were
  // surviving sign-out, locking the next user out of kid-mode and pointing
  // their auto-launch at user A's board UUID. The scrub on SIGNED_OUT now
  // wipes both via clearPersistedCache → clearPin/clearLastBoard.
  it('clears talrum:pin-hash and talrum:last-board from localStorage on SIGNED_OUT (#178)', async () => {
    const sessionA = makeSession('user-a-id', 'a@example.com');
    getSessionMock.mockResolvedValueOnce({ data: { session: sessionA } });
    localStorage.setItem('talrum:pin-hash', 'hash-of-1234');
    localStorage.setItem('talrum:last-board', '{"id":"abc","kind":"sequence"}');

    render(
      <AuthGate>
        <div data-testid="app-body">app</div>
      </AuthGate>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('app-body')).toBeInTheDocument();
    });

    act(() => {
      lastAuthListener?.('SIGNED_OUT', null);
    });
    await waitFor(() => {
      expect(localStorage.getItem('talrum:pin-hash')).toBeNull();
      expect(localStorage.getItem('talrum:last-board')).toBeNull();
    });
  });

  // #179: SIGNED_IN can fire for a different user without an intervening
  // SIGNED_OUT (close-tab-then-resume, or fast account-switch). Without a
  // user-id-change scrub, user B briefly sees user A's persisted cache and
  // localStorage residue.
  it('scrubs PIN + last-board when SIGNED_IN fires for a new user without SIGNED_OUT (#179)', async () => {
    const sessionA = makeSession('user-a-id', 'a@example.com');
    const sessionB = makeSession('user-b-id', 'b@example.com');
    getSessionMock.mockResolvedValueOnce({ data: { session: sessionA } });

    render(
      <AuthGate>
        <UserIdProbe />
      </AuthGate>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('probe-user-id')).toHaveTextContent('user-a-id');
    });

    // User A's residue lands in localStorage during their session.
    localStorage.setItem('talrum:pin-hash', 'user-a-pin-hash');
    localStorage.setItem('talrum:last-board', '{"id":"a-board","kind":"choice"}');

    // No SIGNED_OUT — user B simply signs in on the same device.
    act(() => {
      lastAuthListener?.('SIGNED_IN', sessionB);
    });
    await waitFor(() => {
      expect(screen.getByTestId('probe-user-id')).toHaveTextContent('user-b-id');
      expect(localStorage.getItem('talrum:pin-hash')).toBeNull();
      expect(localStorage.getItem('talrum:last-board')).toBeNull();
    });
  });

  // Token refreshes fire SIGNED_IN with the same user.id. Scrubbing on
  // every SIGNED_IN would wipe the cache on a routine refresh and cause a
  // visible reload flicker; the user-id check below avoids that.
  it('does NOT scrub on SIGNED_IN with the same user.id (token refresh)', async () => {
    const sessionA = makeSession('user-a-id', 'a@example.com');
    getSessionMock.mockResolvedValueOnce({ data: { session: sessionA } });

    render(
      <AuthGate>
        <UserIdProbe />
      </AuthGate>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('probe-user-id')).toHaveTextContent('user-a-id');
    });

    localStorage.setItem('talrum:pin-hash', 'should-survive-refresh');
    localStorage.setItem('talrum:last-board', '{"id":"keep","kind":"sequence"}');

    act(() => {
      lastAuthListener?.('TOKEN_REFRESHED', sessionA);
    });
    // Two microtask flushes guarantee any unwanted async scrub would have
    // landed; waitFor doesn't fit a negative assertion.
    await Promise.resolve();
    await Promise.resolve();
    expect(localStorage.getItem('talrum:pin-hash')).toBe('should-survive-refresh');
    expect(localStorage.getItem('talrum:last-board')).toBe('{"id":"keep","kind":"sequence"}');
  });

  // #184: switching VITE_SUPABASE_URL leaves the previous project's
  // sb-<host>-auth-token in localStorage forever. AuthGate sweeps once on
  // mount; the current project's key (derived from VITE_SUPABASE_URL) is
  // preserved.
  it('sweeps stale sb-*-auth-token keys on mount, preserving the current project key (#184)', async () => {
    // .env.local pins VITE_SUPABASE_URL at https://wcwkxjjhribuecvcdenm.supabase.co
    // for tests. The first segment of the host is the project ref.
    const currentHost = new URL(import.meta.env.VITE_SUPABASE_URL).host;
    const currentRef = currentHost.split(':')[0]?.split('.')[0] ?? '';
    const currentKey = `sb-${currentRef}-auth-token`;

    localStorage.setItem(currentKey, '{"current":1}');
    localStorage.setItem('sb-some-other-ref-auth-token', '{"stale":1}');
    localStorage.setItem('sb-127-auth-token', '{"stale":2}');

    getSessionMock.mockResolvedValueOnce({ data: { session: null } });
    render(
      <AuthGate>
        <div>app</div>
      </AuthGate>,
    );

    await waitFor(() => {
      expect(localStorage.getItem('sb-some-other-ref-auth-token')).toBeNull();
      expect(localStorage.getItem('sb-127-auth-token')).toBeNull();
    });
    expect(localStorage.getItem(currentKey)).toBe('{"current":1}');
  });
});
