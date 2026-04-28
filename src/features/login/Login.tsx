import { type FormEvent, type JSX, useState } from 'react';

import talrumLogo from '@/assets/talrum-logo.png';
import { supabase } from '@/lib/supabase';
import { useOnline } from '@/lib/useOnline';
import { Button } from '@/ui/Button/Button';
import { TextField } from '@/ui/TextField/TextField';

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
  const online = useOnline();

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
        <div className={styles.brand}>
          <img src={talrumLogo} alt="" width={72} height={72} className={styles.mark} />
          <h1 className={styles.title}>Talrum</h1>
          <p className={styles.subtitle}>Sign in with a one-time code.</p>
        </div>
        {!online && (
          <div role="status" className={styles.offline}>
            You're offline — sign-in needs a network connection. Reconnect and try again.
          </div>
        )}
        {stage === 'email' ? (
          <form className={styles.form} onSubmit={(e) => void sendCode(e)}>
            <TextField
              label="Email"
              type="email"
              name="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="parent@example.com"
            />
            {error && <div className={styles.error}>{error}</div>}
            <Button type="submit" variant="primary" disabled={busy || !email.trim() || !online}>
              {busy ? 'Sending…' : 'Send code'}
            </Button>
          </form>
        ) : (
          <form className={styles.form} onSubmit={(e) => void verify(e)}>
            <div className={styles.hint}>
              Code sent to <strong>{email}</strong>. Check your email (or Inbucket in dev).
            </div>
            <TextField
              label="Code"
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
              placeholder="••••••"
              inputClassName={styles.otp}
            />
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
              <Button type="submit" variant="primary" disabled={busy || code.length < 6 || !online}>
                {busy ? 'Verifying…' : 'Sign in'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
