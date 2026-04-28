import type { Session } from '@supabase/supabase-js';
import { type JSX, type ReactNode, useCallback, useEffect, useState } from 'react';

import { Login } from '@/features/login/Login';
import { clearPersistedCache } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { useOnline } from '@/lib/useOnline';
import { Spinner } from '@/ui/Spinner/Spinner';

import styles from './AuthGate.module.css';
import { SessionProvider } from './SessionProvider';

type AuthState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'out' }
  | { status: 'in'; session: Session };

// Public routes are reachable without a session. The deletion-success page
// is the canonical case: the user just signed out as part of account
// deletion, so the regular Login screen would obscure the confirmation.
// Components rendered through this path MUST NOT call useSession() — there
// is no SessionProvider in scope.
const PUBLIC_PATHS: ReadonlySet<string> = new Set(['/account-deleted', '/privacy-policy']);

// Strip a trailing slash before lookup so '/account-deleted' and
// '/account-deleted/' both match. CDN normalization, copy-pasted URLs, or
// router quirks can introduce the slash; without normalization the user
// gets bounced to Login.
const normalizePath = (p: string): string => p.replace(/\/$/, '') || '/';

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
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Drop the persisted React Query cache when the user signs out so the
      // next sign-in (potentially a different account on the same device)
      // doesn't briefly render the previous user's boards from disk.
      if (event === 'SIGNED_OUT') {
        void clearPersistedCache();
      }
      setState(session ? { status: 'in', session } : { status: 'out' });
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [retryCount]);

  const retry = useCallback(() => setRetryCount((n) => n + 1), []);

  if (state.status === 'loading') return <AuthGateLoading key={retryCount} onRetry={retry} />;
  if (state.status === 'error') return <AuthGateError message={state.message} onRetry={retry} />;
  if (state.status === 'out') {
    // Path-based escape hatch: signed-out users can still reach the
    // post-deletion confirmation and the public privacy policy. children is
    // returned without SessionProvider — the route components are static
    // and do not call session-dependent hooks.
    if (PUBLIC_PATHS.has(normalizePath(window.location.pathname))) return <>{children}</>;
    return <Login />;
  }
  return <SessionProvider session={state.session}>{children}</SessionProvider>;
};

const AuthGateOfflineHint = (): JSX.Element | null => {
  const online = useOnline();
  if (online) return null;
  return <p className={styles.errorBody}>You're offline — Retry once your connection is back.</p>;
};

const HUNG_GETSESSION_HINT_MS = 5000;

/**
 * If `getSession()` neither resolves nor rejects within 5s and the device
 * is offline, swap the spinner for the offline hint + Retry button (#30).
 * supabase-js usually rejects fast on offline, but if a request hangs the
 * user shouldn't stare at a forever-spinner with no escape hatch.
 */
const AuthGateLoading = ({ onRetry }: { onRetry: () => void }): JSX.Element => {
  const online = useOnline();
  const [hung, setHung] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setHung(true), HUNG_GETSESSION_HINT_MS);
    return () => clearTimeout(id);
  }, []);

  if (hung && !online) {
    return (
      <div className={`tal ${styles.error}`}>
        <h1 className={styles.errorTitle}>You're offline</h1>
        <p className={styles.errorBody}>
          We can't reach the server right now. Retry once your connection is back.
        </p>
        <button type="button" onClick={onRetry} className={styles.errorRetry}>
          Retry
        </button>
      </div>
    );
  }
  return (
    <div className={`tal ${styles.loading}`}>
      <Spinner />
      <p className={styles.loadingBody}>Loading…</p>
    </div>
  );
};

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
    <AuthGateOfflineHint />
    <button type="button" onClick={onRetry} className={styles.errorRetry}>
      Retry
    </button>
  </div>
);
