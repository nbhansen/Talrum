import type { Session, User } from '@supabase/supabase-js';
import { createContext, useContext } from 'react';

import { supabase } from '@/lib/supabase';

export interface SessionContextValue {
  session: Session;
  user: User;
  signOut: () => Promise<void>;
}

/**
 * Single sign-out implementation. SessionProvider wires this into the
 * context for in-tree consumers (`useSignOut`); out-of-tree call sites
 * (account deletion mutation) import it directly. Centralizing here keeps
 * `supabase.auth.signOut` to one call site — see issue #126.
 */
export const performSignOut = async (): Promise<void> => {
  await supabase.auth.signOut();
};

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
