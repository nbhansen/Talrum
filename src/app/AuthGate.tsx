import type { Session } from '@supabase/supabase-js';
import { type JSX, type ReactNode, useCallback, useEffect, useState } from 'react';

import { Login } from '@/features/login/Login';
import { supabase } from '@/lib/supabase';

import styles from './AuthGate.module.css';
import { SessionProvider } from './SessionProvider';

type AuthState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'out' }
  | { status: 'in'; session: Session };

/**
 * Sole subscriber to Supabase auth. Renders the login screen when no session
 * exists, mounts SessionProvider with the resolved session otherwise. Every
 * descendant reads the session via useSession() / useSessionUser().
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

  if (state.status === 'loading') return <AuthGateLoading />;
  if (state.status === 'error') return <AuthGateError message={state.message} onRetry={retry} />;
  if (state.status === 'out') return <Login />;
  return <SessionProvider session={state.session}>{children}</SessionProvider>;
};

const AuthGateLoading = (): JSX.Element => (
  <div className={`tal ${styles.loading}`}>
    <div className={styles.spinner} aria-hidden="true" />
    <p className={styles.loadingBody}>Loading…</p>
  </div>
);

const AuthGateError = ({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}): JSX.Element => (
  <div className={`tal ${styles.error}`}>
    <h1 className={styles.errorTitle}>Could not reach the server</h1>
    <p className={styles.errorBody}>{message}</p>
    <button type="button" onClick={onRetry} className={styles.errorRetry}>
      Retry
    </button>
  </div>
);
