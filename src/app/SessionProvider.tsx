import type { Session } from '@supabase/supabase-js';
import { type JSX, type ReactNode, useMemo } from 'react';

import { performSignOut, SessionContext, type SessionContextValue } from '@/lib/auth/session';

interface SessionProviderProps {
  session: Session;
  children: ReactNode;
}

/** Mounted by AuthGate once the session resolves, so descendants never subscribe. */
export const SessionProvider = ({ session, children }: SessionProviderProps): JSX.Element => {
  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      user: session.user,
      signOut: performSignOut,
    }),
    [session],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};
