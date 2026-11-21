import type { Session, User } from '@supabase/supabase-js';
import { createContext, useContext } from 'react';

import { supabase } from '@/lib/supabase';

/** The one call site for `supabase.auth.signOut` (#126). */
export const performSignOut = async (): Promise<void> => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const SessionContext = createContext<Session | null>(null);

export const useSession = (): Session => {
  const session = useContext(SessionContext);
  if (!session) {
    throw new Error('useSession used outside SessionProvider — wrap your tree in AuthGate.');
  }
  return session;
};

export const useSessionUser = (): User => useSession().user;

/** Returns undefined for phone-only auth sessions, which have no email. */
export const useUserEmail = (): string | undefined => useSessionUser().email;
