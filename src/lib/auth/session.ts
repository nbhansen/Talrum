import type { Session, User } from '@supabase/supabase-js';
import { createContext, useContext } from 'react';

export interface SessionContextValue {
  session: Session;
  user: User;
  signOut: () => Promise<void>;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

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
  const first = useSessionUser().email?.[0];
  return first ? first.toUpperCase() : undefined;
};

/** Same undefined caveat as useUserInitial — phone-only auth has no email. */
export const useUserEmail = (): string | undefined => useSessionUser().email;
