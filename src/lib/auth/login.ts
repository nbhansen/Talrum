import { useState } from 'react';

import { supabase } from '@/lib/supabase';

export interface UseEmailCode {
  sendCode: (email: string) => Promise<boolean>;
  verifyCode: (email: string, code: string) => Promise<boolean>;
  busy: boolean;
  error: string | null;
  resetError: () => void;
}

/**
 * Email code sign-in. A typed code signs in the app that asked for it; a link
 * signs in only the browser that opens it, never an installed Home Screen app
 * (#498). The code renders only while the dashboard-managed email template
 * keeps `{{ .Token }}` (#219).
 */
export const useEmailCode = (): UseEmailCode => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async (email: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (otpError) {
      setError(otpError.message);
      return false;
    }
    return true;
  };

  const verifyCode = async (email: string, code: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    });
    setBusy(false);
    if (verifyError) {
      setError(verifyError.message);
      return false;
    }
    return true;
  };

  const resetError = (): void => setError(null);

  return { sendCode, verifyCode, busy, error, resetError };
};
