import { useState } from 'react';

import { supabase } from '@/lib/supabase';

export interface UseEmailCode {
  sendCode: (email: string) => Promise<boolean>;
  verifyCode: (email: string, code: string) => Promise<boolean>;
  busy: boolean;
  error: string | null;
  resetError: () => void;
}

// A typed code, not a link: a link never reaches an installed Home Screen app (#498).
export const useEmailCode = (): UseEmailCode => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (
    call: () => Promise<{ error: { message: string } | null }>,
  ): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const { error: authError } = await call();
    setBusy(false);
    if (authError) setError(authError.message);
    return !authError;
  };

  const sendCode = (email: string): Promise<boolean> =>
    run(() => supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } }));

  const verifyCode = (email: string, code: string): Promise<boolean> =>
    run(() => supabase.auth.verifyOtp({ email, token: code, type: 'email' }));

  const resetError = (): void => setError(null);

  return { sendCode, verifyCode, busy, error, resetError };
};
