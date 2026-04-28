import { useState } from 'react';

import { supabase } from '@/lib/supabase';

export interface UseEmailOtp {
  sendCode: (email: string) => Promise<boolean>;
  verify: (email: string, code: string) => Promise<boolean>;
  busy: boolean;
  error: string | null;
  resetError: () => void;
}

/**
 * Two-step email OTP sign-in. Step 1 (`sendCode`) requests a code email;
 * step 2 (`verify`) submits the 6-digit code. Both return `true` on success
 * so callers can advance UI state without inspecting `error`. Centralized
 * here so features never call `supabase.auth.{signInWithOtp,verifyOtp}`
 * directly — see issue #126.
 */
export const useEmailOtp = (): UseEmailOtp => {
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

  const verify = async (email: string, code: string): Promise<boolean> => {
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

  return { sendCode, verify, busy, error, resetError };
};
