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

const clearPersistedCacheMock = vi.fn<() => Promise<void>>();
const captureExceptionMock = vi.fn();

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

// The real impl by default, so the localStorage tests below keep working.
vi.mock('@/lib/queryClient', async (importOriginal) => {
  const actual = (await importOriginal()) as { clearPersistedCache: () => Promise<void> } & Record<
    string,
    unknown
  >;
  clearPersistedCacheMock.mockImplementation(actual.clearPersistedCache);
  return {
    ...actual,
    clearPersistedCache: () => clearPersistedCacheMock(),
  };
});

vi.mock('@/lib/platform/telemetry', () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
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
  clearPersistedCacheMock.mockClear();
  captureExceptionMock.mockReset();
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

  // Fails if the PUBLIC_PATHS check leaves the `out` branch: at the moment
  // SIGNED_OUT lands, a user already on /account-deleted must keep seeing it
  // rather than bounce to <Login />.
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
      await waitFor(() => {
        expect(screen.getByTestId('public-children')).toBeInTheDocument();
      });

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

  // Signing back in as a different user must carry the new user.id through
  // SessionProvider, or dependent hooks keep reading the old one.
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

  // getSession can lag (it refreshes an expired token over the network). A
  // SIGNED_IN that lands first must win over the stale getSession result, or
  // a just-signed-in user bounces back to Login.
  it('ignores a late getSession result once an auth event has landed', async () => {
    let resolveGetSession: (v: { data: { session: Session | null } }) => void = () => undefined;
    getSessionMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveGetSession = resolve;
      }),
    );
    const sessionB = makeSession('user-b-id', 'b@example.com');
    render(
      <AuthGate>
        <UserIdProbe />
      </AuthGate>,
    );

    act(() => {
      lastAuthListener?.('SIGNED_IN', sessionB);
    });
    await waitFor(() => {
      expect(screen.getByTestId('probe-user-id')).toHaveTextContent('user-b-id');
    });

    await act(async () => {
      resolveGetSession({ data: { session: null } });
    });
    expect(screen.getByTestId('probe-user-id')).toHaveTextContent('user-b-id');
    expect(screen.queryByText('login screen')).not.toBeInTheDocument();
  });

  // These survived sign-out, locking the next user out of kid mode and aiming
  // their auto-launch at user A's board (#178).
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

  // SIGNED_IN can fire for a different user with no SIGNED_OUT between —
  // close-tab-then-resume, or a fast account switch (#179).
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

  // A token refresh fires SIGNED_IN with the same id, and scrubbing on every
  // one would flicker the app on a routine refresh.
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

    await act(async () => {
      lastAuthListener?.('TOKEN_REFRESHED', sessionA);
    });
    // waitFor does not fit a negative assertion — it would pass immediately
    // without waiting. The same-id branch is synchronous, so act is enough.
    expect(localStorage.getItem('talrum:pin-hash')).toBe('should-survive-refresh');
    expect(localStorage.getItem('talrum:last-board')).toBe('{"id":"keep","kind":"sequence"}');
  });

  // The scrub is fire-and-forget, because sign-out must not block on it. It
  // still reports, or a persistent IDB failure stays invisible (#142).
  it('captures a warning when clearPersistedCache rejects on SIGNED_OUT (#142)', async () => {
    const cacheError = new Error('idb wedged');
    clearPersistedCacheMock.mockRejectedValueOnce(cacheError);
    const sessionA = makeSession('user-a-id', 'a@example.com');
    getSessionMock.mockResolvedValueOnce({ data: { session: sessionA } });
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
      expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    });
    const [err, ctx] = captureExceptionMock.mock.calls[0] as [
      unknown,
      { level?: string; tags?: Record<string, string> },
    ];
    expect(err).toBe(cacheError);
    expect(ctx.level).toBe('warning');
    expect(ctx.tags).toMatchObject({ component: 'AuthGate', op: 'clearPersistedCache' });
  });

  // Switching VITE_SUPABASE_URL strands the previous project's auth token in
  // localStorage forever (#184).
  it('sweeps stale sb-*-auth-token keys on mount, preserving the current project key (#184)', async () => {
    // CI does not load .env.local, so the real env var would be undefined.
    vi.stubEnv('VITE_SUPABASE_URL', 'https://testref.supabase.co');
    const currentKey = 'sb-testref-auth-token';

    try {
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
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
