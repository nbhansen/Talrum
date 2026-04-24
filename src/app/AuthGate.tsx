import type { Session } from '@supabase/supabase-js';
import { type JSX, type ReactNode, useCallback, useEffect, useState } from 'react';

import { Login } from '@/features/login/Login';
import { supabase } from '@/lib/supabase';

type AuthState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'out' }
  | { status: 'in'; session: Session };

/**
 * Wraps the routed app. Renders the login screen when no session exists, the
 * children when signed in. Subscribes to `onAuthStateChange` so the switch is
 * immediate on sign-in/sign-out without prop drilling.
 */
export const AuthGate = ({ children }: { children: ReactNode }): JSX.Element => {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        setState(data.session ? { status: 'in', session: data.session } : { status: 'out' });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Could not reach auth service.';
        setState({ status: 'error', message });
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(session ? { status: 'in', session } : { status: 'out' });
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [retryCount]);

  const retry = useCallback(() => setRetryCount((n) => n + 1), []);

  if (state.status === 'loading') return <div className="tal" />;
  if (state.status === 'error') return <AuthGateError message={state.message} onRetry={retry} />;
  if (state.status === 'out') return <Login />;
  return <>{children}</>;
};

const AuthGateError = ({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}): JSX.Element => (
  <div
    className="tal"
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      padding: 32,
      textAlign: 'center',
      height: '100vh',
    }}
  >
    <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Could not reach the server</h1>
    <p style={{ fontSize: 15, color: 'var(--tal-ink-soft)', margin: 0, maxWidth: 420 }}>
      {message}
    </p>
    <button
      type="button"
      onClick={onRetry}
      style={{
        padding: '10px 20px',
        fontSize: 15,
        fontWeight: 700,
        borderRadius: 999,
        border: 'none',
        background: 'var(--tal-sage)',
        color: 'var(--tal-sage-ink)',
        cursor: 'pointer',
      }}
    >
      Retry
    </button>
  </div>
);
