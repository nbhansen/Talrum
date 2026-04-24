import { type FormEvent, type JSX, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { Button } from '@/ui/Button/Button';

import styles from './Login.module.css';

type Stage = 'email' | 'otp';

/**
 * Two-step magic-link sign-in. Step 1 sends an OTP email; step 2 verifies the
 * 6-digit code. In local dev the email is captured by Inbucket at
 * http://localhost:54324 — open the latest message, copy the code, paste.
 * New emails trigger handle_new_user() which clones the starter library.
 */
export const Login = (): JSX.Element => {
  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (otpError) {
      setError(otpError.message);
      return;
    }
    setStage('otp');
  };

  const verify = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const trimmedCode = code.trim();
    if (!trimmedCode) return;
    setBusy(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: trimmedCode,
      type: 'email',
    });
    setBusy(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    // AuthGate sees the new session and flips to the app. Nothing more to do.
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <h1 className={styles.title}>Talrum</h1>
        <p className={styles.subtitle}>Sign in with a one-time code.</p>
        {stage === 'email' ? (
          <form className={styles.form} onSubmit={(e) => void sendCode(e)}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Email</span>
              <input
                type="email"
                name="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={styles.input}
                placeholder="parent@example.com"
              />
            </label>
            {error && <div className={styles.error}>{error}</div>}
            <Button type="submit" variant="primary" disabled={busy || !email.trim()}>
              {busy ? 'Sending…' : 'Send code'}
            </Button>
          </form>
        ) : (
          <form className={styles.form} onSubmit={(e) => void verify(e)}>
            <div className={styles.hint}>
              Code sent to <strong>{email}</strong>. Check your email (or Inbucket in dev).
            </div>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Code</span>
              <input
                type="text"
                name="otp"
                required
                autoFocus
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className={`${styles.input} ${styles.otp}`}
                placeholder="••••••"
              />
            </label>
            {error && <div className={styles.error}>{error}</div>}
            <div className={styles.row}>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setStage('email');
                  setCode('');
                  setError(null);
                }}
                disabled={busy}
              >
                Back
              </Button>
              <Button type="submit" variant="primary" disabled={busy || code.length < 6}>
                {busy ? 'Verifying…' : 'Sign in'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
