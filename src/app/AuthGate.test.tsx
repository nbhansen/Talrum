import type { Session } from '@supabase/supabase-js';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { describe, expect, it, vi } from 'vitest';

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
const { useSessionUser } = await import('./session');

const UserIdProbe = (): JSX.Element => <div data-testid="probe-user-id">{useSessionUser().id}</div>;

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
});
