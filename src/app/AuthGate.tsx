import type { Session } from '@supabase/supabase-js';
import { type JSX, type ReactNode, useEffect, useState } from 'react';

import { Login } from '@/features/login/Login';
import { supabase } from '@/lib/supabase';

type AuthState = { status: 'loading' } | { status: 'out' } | { status: 'in'; session: Session };

/**
 * Wraps the routed app. Renders the login screen when no session exists, the
 * children when signed in. Subscribes to `onAuthStateChange` so the switch is
 * immediate on sign-in/sign-out without prop drilling.
 */
export const AuthGate = ({ children }: { children: ReactNode }): JSX.Element => {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setState(data.session ? { status: 'in', session: data.session } : { status: 'out' });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(session ? { status: 'in', session } : { status: 'out' });
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (state.status === 'loading') return <div className="tal" />;
  if (state.status === 'out') return <Login />;
  return <>{children}</>;
};
