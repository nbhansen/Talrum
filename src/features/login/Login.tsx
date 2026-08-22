import { type FormEvent, type JSX, useState } from 'react';

import talrumLogo from '@/assets/talrum-logo.png';
import { useEmailCode } from '@/lib/auth/login';
import { useOnline } from '@/lib/useOnline';
import { Button } from '@/ui/Button/Button';
import { TextField } from '@/ui/TextField/TextField';

import styles from './Login.module.css';

type Stage = 'email' | 'sent' | 'code';

export const Login = (): JSX.Element => {
  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const online = useOnline();
  const { sendCode, verifyCode, busy, error, resetError } = useEmailCode();

  const onSendCode = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    const ok = await sendCode(trimmed);
    if (ok) setStage('sent');
  };

  const onVerify = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!code || !email.trim()) return;
    await verifyCode(email.trim().toLowerCase(), code);
  };

  return (
    <main className={styles.wrap} role="main">
      <div className={styles.card}>
        <div className={styles.brand}>
          <img src={talrumLogo} alt="" width={72} height={72} className={styles.mark} />
          <h1 className={styles.title}>Talrum</h1>
          <p className={styles.subtitle}>Sign in with your email.</p>
        </div>
        {!online && (
          <div role="status" className={styles.offline}>
            You're offline — sign-in needs a network connection. Reconnect and try again.
          </div>
        )}
        {stage === 'email' ? (
          <form className={styles.form} onSubmit={(e) => void onSendCode(e)}>
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
            <div className={styles.row}>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setStage('code');
                  resetError();
                }}
                disabled={busy}
              >
                I have a code
              </Button>
              <Button type="submit" variant="primary" disabled={busy || !email.trim() || !online}>
                {busy ? 'Sending…' : 'Send code'}
              </Button>
            </div>
          </form>
        ) : (
          <form className={styles.form} onSubmit={(e) => void onVerify(e)}>
            <div role="status" className={styles.hint}>
              {stage === 'sent' ? (
                <>
                  Check your email — we sent a code to <strong>{email}</strong>. Type it here. (In
                  dev, see Mailpit.)
                </>
              ) : (
                <>Type your email and the code from the sign-in email.</>
              )}
            </div>
            {stage === 'code' && (
              <TextField
                label="Email"
                type="email"
                name="email"
                required
                autoFocus={!email.trim()}
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="parent@example.com"
              />
            )}
            <TextField
              label="Code"
              type="text"
              name="otp"
              autoFocus={stage === 'sent' || Boolean(email.trim())}
              autoComplete="one-time-code"
              inputMode="numeric"
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
                  resetError();
                }}
                disabled={busy}
              >
                Use a different email
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={busy || !code || !email.trim() || !online}
              >
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
};
