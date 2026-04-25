import type { Session, User } from '@supabase/supabase-js';
import { createContext, type JSX, type ReactNode, useContext, useMemo } from 'react';

import { supabase } from '@/lib/supabase';

interface SessionContextValue {
  session: Session;
  user: User;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

interface SessionProviderProps {
  session: Session;
  children: ReactNode;
}

/**
 * Single source of truth for the signed-in user. Mounted by AuthGate after
 * the session has resolved, so any component below can `useSession()` /
 * `useSessionUser()` / `useSignOut()` without subscribing to auth itself.
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

const useSessionContext = (): SessionContextValue => {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession used outside SessionProvider — wrap your tree in AuthGate.');
  }
  return ctx;
};

export const useSession = (): Session => useSessionContext().session;
export const useSessionUser = (): User => useSessionContext().user;
export const useSignOut = (): (() => Promise<void>) => useSessionContext().signOut;

/**
 * Uppercase first character of the user's email, or undefined when the user
 * has no email on the session (rare — e.g. phone-only auth, not used here).
 */
export const useUserInitial = (): string | undefined => {
  const user = useSessionUser();
  const first = user.email?.[0];
  return first ? first.toUpperCase() : undefined;
};
