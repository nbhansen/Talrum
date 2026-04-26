import type { Session } from '@supabase/supabase-js';
import { type JSX, type ReactNode, useMemo } from 'react';

import { SessionContext, type SessionContextValue } from '@/lib/auth/session';
import { supabase } from '@/lib/supabase';

interface SessionProviderProps {
  session: Session;
  children: ReactNode;
}

/**
 * Single source of truth for the signed-in user. Mounted by AuthGate after
 * the session has resolved; descendants read via useSession / useSessionUser
 * / useSignOut / useUserInitial without subscribing to auth themselves.
 */
export const SessionProvider = ({ session, children }: SessionProviderProps): JSX.Element => {
  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      user: session.user,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};
