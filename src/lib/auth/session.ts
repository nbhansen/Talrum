import type { Session, User } from '@supabase/supabase-js';
import { createContext, useContext } from 'react';

import { supabase } from '@/lib/supabase';

export interface SessionContextValue {
  session: Session;
  user: User;
  signOut: () => Promise<void>;
}

/** The one call site for `supabase.auth.signOut` (#126). */
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

/** Returns undefined for phone-only auth sessions, which have no email. */
export const useUserEmail = (): string | undefined => useSessionUser().email;
