import { useState } from 'react';

import { supabase } from '@/lib/supabase';

export interface UseMagicLink {
  sendLink: (email: string) => Promise<boolean>;
  busy: boolean;
  error: string | null;
  resetError: () => void;
}

/**
 * Magic-link email sign-in. `detectSessionInUrl` exchanges the returning URL
 * for a session and AuthGate picks it up. A link, not a typed code (#219): the
 * 6-digit code renders only if the dashboard-managed email template keeps
 * `{{ .Token }}`, which prod dropped once. Centralised here per #126.
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
