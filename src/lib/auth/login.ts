import { useState } from 'react';

import { supabase } from '@/lib/supabase';

export interface UseMagicLink {
  sendLink: (email: string) => Promise<boolean>;
  busy: boolean;
  error: string | null;
  resetError: () => void;
}

/**
 * Magic-link email sign-in. `sendLink` requests an email; the user clicks the
 * link, lands back on the app at `emailRedirectTo`, and supabase-js's
 * `detectSessionInUrl` (on by default) exchanges the URL for a session, which
 * AuthGate picks up. Returns `true` on success so callers can advance UI state
 * without inspecting `error`. Centralized here so features never call
 * `supabase.auth.signInWithOtp` directly — see issue #126.
 *
 * Why a link, not a typed code (#219): the 6-digit code only reaches the user
 * if the email template renders `{{ .Token }}`, which is dashboard-managed and
 * was dropped in prod. The link is present in every email regardless of
 * template, so it's the only sign-in path the frontend can guarantee works.
 */
export const useMagicLink = (): UseMagicLink => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendLink = async (email: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (otpError) {
      setError(otpError.message);
      return false;
    }
    return true;
  };

  const resetError = (): void => setError(null);

  return { sendLink, busy, error, resetError };
};
