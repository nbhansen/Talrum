import type { Session } from '@supabase/supabase-js';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

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

const UserIdProbe = (): JSX.Element => <div>{useSessionUser().id}</div>;

const renderGate = (child: JSX.Element = <UserIdProbe />): void => {
  render(<AuthGate>{child}</AuthGate>);
};

const atPath = (path: string): void => {
  const originalPath = window.location.pathname;
  history.replaceState(null, '', path);
  onTestFinished(() => history.replaceState(null, '', originalPath));
};

// A stored language, so LanguageGate shows the children.
beforeEach(() => {
  window.localStorage.setItem('talrum:language', 'en');
});

afterEach(() => {
  getSessionMock.mockReset();
  onAuthStateChangeMock.mockClear();
  clearPersistedCacheMock.mockClear();
  captureExceptionMock.mockReset();
});

describe('AuthGate', () => {
  it('shows the loading copy while getSession is pending', () => {
    getSessionMock.mockReturnValueOnce(new Promise(() => undefined));
    renderGate(<div>app body</div>);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText('app body')).not.toBeInTheDocument();
  });

  it('shows an error screen with Retry when getSession rejects', async () => {
    const failure = new Error('fetch failed: net::ERR');
    getSessionMock.mockRejectedValueOnce(failure);
    renderGate(<div>app body</div>);
    await screen.findByText('Could not reach the server');
    expect(screen.getByText('Talrum could not start your session.')).toBeInTheDocument();
    expect(screen.queryByText(/fetch failed/)).not.toBeInTheDocument();
    expect(captureExceptionMock).toHaveBeenCalledWith(failure, {
      level: 'warning',
      tags: { component: 'AuthGate', op: 'getSession' },
    });
    expect(screen.queryByText('app body')).not.toBeInTheDocument();

    getSessionMock.mockResolvedValueOnce({ data: { session: null } });
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('login screen');
  });

  describe('getSession hangs while offline', () => {
    const renderHungOffline = async (): Promise<ReturnType<typeof vi.fn>> => {
      const originalOnline = navigator.onLine;
      const originalLocation = window.location;
      const reload = vi.fn();
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...window.location, reload },
      });
      getSessionMock.mockReturnValueOnce(new Promise(() => undefined));
      vi.useFakeTimers({ shouldAdvanceTime: true });
      onTestFinished(() => {
        vi.useRealTimers();
        Object.defineProperty(navigator, 'onLine', { value: originalOnline, configurable: true });
        Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
      });
      renderGate(<div>app body</div>);
      expect(screen.getByText('Loading…')).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      await screen.findByText("You're offline");
      return reload;
    };

    it('reloads the page from the offline screen when a service worker controls it (#714)', async () => {
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: { controller: {} },
      });
      onTestFinished(() => {
        Reflect.deleteProperty(navigator, 'serviceWorker');
      });
      const reload = await renderHungOffline();
      await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('offers no reload when no service worker can serve the app shell (#714)', async () => {
      await renderHungOffline();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  it('offers a page reload after 5s if getSession hangs while online (#678)', async () => {
    const originalLocation = window.location;
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });
    getSessionMock.mockReturnValueOnce(new Promise(() => undefined));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderGate(<div>app body</div>);
      expect(screen.queryByRole('button', { name: 'Reload' })).not.toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByText('Loading…')).toBeInTheDocument();
      await userEvent.click(await screen.findByRole('button', { name: 'Reload' }));
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    }
  });

  it.each(['/account-deleted', '/account-deleted/'])(
    'renders children (not Login) when out and on the public path %s',
    async (path) => {
      atPath(path);
      getSessionMock.mockResolvedValueOnce({ data: { session: null } });
      renderGate(<div>deleted page</div>);
      expect(await screen.findByText('deleted page')).toBeInTheDocument();
      expect(screen.queryByText('login screen')).not.toBeInTheDocument();
    },
  );

  // Fails if the PUBLIC_PATHS check leaves the `out` branch: at the moment
  // SIGNED_OUT lands, a user already on /account-deleted must keep seeing it
  // rather than bounce to <Login />.
  it('keeps showing children on /account-deleted when SIGNED_OUT fires after navigation', async () => {
    atPath('/account-deleted');
    const sessionA = makeSession('user-a-id', 'a@example.com');
    getSessionMock.mockResolvedValueOnce({ data: { session: sessionA } });
    renderGate(<div>deleted page</div>);
    await screen.findByText('deleted page');

    act(() => {
      lastAuthListener?.('SIGNED_OUT', null);
    });
    expect(await screen.findByText('deleted page')).toBeInTheDocument();
    expect(screen.queryByText('login screen')).not.toBeInTheDocument();
  });

  it('still shows Login when out and on a non-public path', async () => {
    atPath('/');
    getSessionMock.mockResolvedValueOnce({ data: { session: null } });
    renderGate(<div>should not render</div>);
    expect(await screen.findByText('login screen')).toBeInTheDocument();
    expect(screen.queryByText('should not render')).not.toBeInTheDocument();
  });

  // Signing back in as a different user must carry the new user.id through
  // SessionContext, or dependent hooks keep reading the old one.
  it('propagates a new session.user when onAuthStateChange fires after re-auth', async () => {
    const sessionA = makeSession('user-a-id', 'a@example.com');
    const sessionB = makeSession('user-b-id', 'b@example.com');
    getSessionMock.mockResolvedValueOnce({ data: { session: sessionA } });
    renderGate();
    await screen.findByText('user-a-id');

    act(() => {
      lastAuthListener?.('SIGNED_OUT', null);
    });
    await screen.findByText('login screen');

    act(() => {
      lastAuthListener?.('SIGNED_IN', sessionB);
    });
    await screen.findByText('user-b-id');
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
    renderGate();

    act(() => {
      lastAuthListener?.('SIGNED_IN', sessionB);
    });
    await screen.findByText('user-b-id');

    await act(async () => {
      resolveGetSession({ data: { session: null } });
    });
    expect(screen.getByText('user-b-id')).toBeInTheDocument();
    expect(screen.queryByText('login screen')).not.toBeInTheDocument();
  });

  // These survived sign-out, locking the next user out of kid mode and aiming
  // their auto-launch at user A's board (#178).
  it('clears talrum:pin-hash and talrum:last-board from localStorage on SIGNED_OUT (#178)', async () => {
    const sessionA = makeSession('user-a-id', 'a@example.com');
    getSessionMock.mockResolvedValueOnce({ data: { session: sessionA } });
    localStorage.setItem('talrum:pin-hash', 'hash-of-1234');
    localStorage.setItem('talrum:last-board', '{"id":"abc","kind":"sequence"}');

    renderGate(<div>app</div>);
    await screen.findByText('app');

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

    renderGate();
    await screen.findByText('user-a-id');

    localStorage.setItem('talrum:pin-hash', 'user-a-pin-hash');
    localStorage.setItem('talrum:last-board', '{"id":"a-board","kind":"choice"}');

    // No SIGNED_OUT — user B simply signs in on the same device.
    act(() => {
      lastAuthListener?.('SIGNED_IN', sessionB);
    });
    await waitFor(() => {
      expect(screen.getByText('user-b-id')).toBeInTheDocument();
      expect(localStorage.getItem('talrum:pin-hash')).toBeNull();
      expect(localStorage.getItem('talrum:last-board')).toBeNull();
    });
  });

  it('scrubs when a different user signs in after a signed-out boot (#645)', async () => {
    getSessionMock.mockResolvedValueOnce({ data: { session: null } });
    localStorage.setItem('talrum:store-owner', 'user-a-id');
    localStorage.setItem('talrum:pin-hash', 'user-a-pin-hash');
    localStorage.setItem('talrum:last-board', '{"id":"a-board","kind":"choice"}');

    renderGate();
    await screen.findByText('login screen');

    act(() => {
      lastAuthListener?.('SIGNED_IN', makeSession('user-b-id', 'b@example.com'));
    });
    await waitFor(() => {
      expect(screen.getByText('user-b-id')).toBeInTheDocument();
      expect(localStorage.getItem('talrum:pin-hash')).toBeNull();
      expect(localStorage.getItem('talrum:last-board')).toBeNull();
    });
  });

  it('keeps the stores when the same owner signs in after a signed-out boot', async () => {
    getSessionMock.mockResolvedValueOnce({ data: { session: null } });
    localStorage.setItem('talrum:store-owner', 'user-a-id');
    localStorage.setItem('talrum:pin-hash', 'user-a-pin-hash');

    renderGate();
    await screen.findByText('login screen');

    await act(async () => {
      lastAuthListener?.('SIGNED_IN', makeSession('user-a-id', 'a@example.com'));
    });
    expect(screen.getByText('user-a-id')).toBeInTheDocument();
    expect(localStorage.getItem('talrum:pin-hash')).toBe('user-a-pin-hash');
  });

  it('scrubs this tab when another tab already claimed the stores for a new user (#663)', async () => {
    getSessionMock.mockResolvedValueOnce({
      data: { session: makeSession('user-a-id', 'a@example.com') },
    });
    renderGate();
    await screen.findByText('user-a-id');
    localStorage.setItem('talrum:store-owner', 'user-b-id');
    localStorage.setItem('talrum:pin-hash', 'user-a-pin-hash');

    act(() => {
      lastAuthListener?.('SIGNED_IN', makeSession('user-b-id', 'b@example.com'));
    });
    await waitFor(() => {
      expect(screen.getByText('user-b-id')).toBeInTheDocument();
      expect(localStorage.getItem('talrum:pin-hash')).toBeNull();
    });
  });

  it('does not scrub on a token refresh when the owner cannot be read (#663)', async () => {
    const getItem = localStorage.getItem.bind(localStorage);
    const spy = vi.spyOn(localStorage, 'getItem').mockImplementation((key) => {
      if (key === 'talrum:store-owner') throw new Error('blocked');
      return getItem(key);
    });
    onTestFinished(() => spy.mockRestore());
    const sessionA = makeSession('user-a-id', 'a@example.com');
    getSessionMock.mockResolvedValueOnce({ data: { session: sessionA } });
    renderGate();
    await screen.findByText('user-a-id');
    localStorage.setItem('talrum:pin-hash', 'should-survive-refresh');

    await act(async () => {
      lastAuthListener?.('TOKEN_REFRESHED', sessionA);
    });
    expect(localStorage.getItem('talrum:pin-hash')).toBe('should-survive-refresh');
  });

  it('removes the stored owner on SIGNED_OUT (#663)', async () => {
    getSessionMock.mockResolvedValueOnce({
      data: { session: makeSession('user-a-id', 'a@example.com') },
    });
    renderGate();
    await waitFor(() => {
      expect(localStorage.getItem('talrum:store-owner')).toBe('user-a-id');
    });

    act(() => {
      lastAuthListener?.('SIGNED_OUT', null);
    });
    expect(localStorage.getItem('talrum:store-owner')).toBeNull();
  });

  // A token refresh fires SIGNED_IN with the same id, and scrubbing on every
  // one would flicker the app on a routine refresh.
  it('does NOT scrub on SIGNED_IN with the same user.id (token refresh)', async () => {
    const sessionA = makeSession('user-a-id', 'a@example.com');
    getSessionMock.mockResolvedValueOnce({ data: { session: sessionA } });

    renderGate();
    await screen.findByText('user-a-id');

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
    renderGate(<div>app</div>);
    await screen.findByText('app');
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
    onTestFinished(() => {
      vi.unstubAllEnvs();
    });
    const currentKey = 'sb-testref-auth-token';
    localStorage.setItem(currentKey, '{"current":1}');
    localStorage.setItem('sb-some-other-ref-auth-token', '{"stale":1}');
    localStorage.setItem('sb-127-auth-token', '{"stale":2}');

    getSessionMock.mockResolvedValueOnce({ data: { session: null } });
    renderGate(<div>app</div>);

    await waitFor(() => {
      expect(localStorage.getItem('sb-some-other-ref-auth-token')).toBeNull();
      expect(localStorage.getItem('sb-127-auth-token')).toBeNull();
    });
    expect(localStorage.getItem(currentKey)).toBe('{"current":1}');
  });
});
