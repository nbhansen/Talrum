import type { Session } from '@supabase/supabase-js';
import { type JSX, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { Login } from '@/features/login/Login';
import { sweepStaleAuthTokens } from '@/lib/auth/sweepStaleAuthTokens';
import { setOutboxOwner } from '@/lib/outbox';
import { captureException } from '@/lib/platform/telemetry';
import { clearPersistedCache } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { useOnline } from '@/lib/useOnline';
import { Spinner } from '@/ui/Spinner/Spinner';

import styles from './AuthGate.module.css';
import { PUBLIC_PATHS } from './publicPaths';
import { SessionProvider } from './SessionProvider';

type AuthState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'out' }
  | { status: 'in'; session: Session };

// A CDN rewrite or a copy-pasted URL can add a trailing slash, and without
// this the signed-out user is bounced to Login.
const normalizePath = (p: string): string => p.replace(/\/$/, '') || '/';

/** The sole subscriber to Supabase auth. Descendants read `useSession()`. */
export const AuthGate = ({ children }: { children: ReactNode }): JSX.Element => {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [retryCount, setRetryCount] = useState(0);
  // Detects a same-tab account switch: SIGNED_IN for a different user with no
  // SIGNED_OUT between (#179).
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // getSession can resolve late (network token refresh). An auth event that
    // lands first is newer — the stale result must not overwrite it.
    let sawAuthEvent = false;
    // A deliberate sync reset for an async init effect, not a cascading render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ status: 'loading' });
    // Stale keys from a previous VITE_SUPABASE_URL (#184). Idempotent.
    sweepStaleAuthTokens(import.meta.env.VITE_SUPABASE_URL);
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled || sawAuthEvent) return;
        setOutboxOwner(data.session?.user.id ?? null);
        lastUserIdRef.current = data.session?.user.id ?? null;
        setState(data.session ? { status: 'in', session: data.session } : { status: 'out' });
      })
      .catch((err: unknown) => {
        if (cancelled || sawAuthEvent) return;
        const message = err instanceof Error ? err.message : 'Could not reach auth service.';
        setState({ status: 'error', message });
      });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      sawAuthEvent = true;
      const newUserId = session?.user.id ?? null;
      // A token refresh and a first sign-in are not auth boundaries.
      const isUserSwitch =
        newUserId !== null && lastUserIdRef.current !== null && newUserId !== lastUserIdRef.current;
      if (event === 'SIGNED_OUT' || isUserSwitch) {
        clearPersistedCache().catch((err: unknown) =>
          captureException(err, {
            level: 'warning',
            tags: { component: 'AuthGate', op: 'clearPersistedCache' },
          }),
        );
      }
      // The same listener as the sweep, so the queue's owner and the boundary
      // that wipes it can never disagree (#446).
      setOutboxOwner(newUserId);
      lastUserIdRef.current = newUserId;
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
    // No SessionProvider on this branch, so anything routed here must not call
    // a session hook.
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
 * supabase-js usually rejects fast when offline, but a hung request would leave
 * the user on a forever-spinner with no escape (#30).
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
      <div className={styles.error}>
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
    <div className={styles.loading}>
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
  <div className={styles.error}>
    <h1 className={styles.errorTitle}>Could not reach the server</h1>
    <p className={styles.errorBody}>{message}</p>
    <AuthGateOfflineHint />
    <button type="button" onClick={onRetry} className={styles.errorRetry}>
      Retry
    </button>
  </div>
);
