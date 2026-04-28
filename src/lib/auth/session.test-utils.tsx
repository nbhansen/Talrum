import type { Session, User } from '@supabase/supabase-js';
import type { JSX, ReactNode } from 'react';

import { SessionProvider } from '@/app/SessionProvider';

const FAKE_USER: User = {
  id: '00000000-0000-0000-0000-0000000000aa',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2026-04-01T00:00:00Z',
  email: 'parent@example.com',
} as User;

const FAKE_SESSION: Session = {
  access_token: 'fake',
  refresh_token: 'fake',
  expires_in: 3600,
  token_type: 'bearer',
  user: FAKE_USER,
} as Session;

interface TestSessionProviderProps {
  children: ReactNode;
  session?: Session;
}

/**
 * Wraps tests in a SessionProvider with a fake authenticated user. Use when
 * rendering anything that calls useSession / useSessionUser / useSignOut /
 * useUserInitial / useUserEmail — e.g. ParentShell-wrapping screens.
 */
export const TestSessionProvider = ({
  children,
  session = FAKE_SESSION,
}: TestSessionProviderProps): JSX.Element => (
  <SessionProvider session={session}>{children}</SessionProvider>
);
