import type { Session } from '@supabase/supabase-js';
import type { JSX, ReactNode } from 'react';

import { SessionContext } from '@/lib/auth/session';

interface SessionProviderProps {
  session: Session;
  children: ReactNode;
}

/** Mounted by AuthGate once the session resolves, so descendants never subscribe. */
export const SessionProvider = ({ session, children }: SessionProviderProps): JSX.Element => (
  <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
);
