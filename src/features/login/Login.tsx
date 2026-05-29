import { type FormEvent, type JSX, useState } from 'react';

import talrumLogo from '@/assets/talrum-logo.png';
import { useMagicLink } from '@/lib/auth/login';
import { useOnline } from '@/lib/useOnline';
import { Button } from '@/ui/Button/Button';
import { TextField } from '@/ui/TextField/TextField';

import styles from './Login.module.css';

type Stage = 'email' | 'sent';

/**
 * Magic-link sign-in. Step 1 sends an email with a sign-in link; the parent
 * opens it on the same device and supabase-js exchanges the URL for a session
 * (AuthGate then flips to the app). In local dev the email is captured by
 * Mailpit at http://localhost:54324 — open the latest message, click the link.
 * New emails trigger handle_new_user() which clones the starter library.
 */
export const Login = (): JSX.Element => {
  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState('');
  const online = useOnline();
  const { sendLink, busy, error, resetError } = useMagicLink();

  const onSendLink = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    const ok = await sendLink(trimmed);
    if (ok) setStage('sent');
  };

  return (
    <main className={styles.wrap} role="main">
      <div className={styles.card}>
        <div className={styles.brand}>
          <img src={talrumLogo} alt="" width={72} height={72} className={styles.mark} />
          <h1 className={styles.title}>Talrum</h1>
          <p className={styles.subtitle}>Sign in with a magic link.</p>
        </div>
        {!online && (
          <div role="status" className={styles.offline}>
            You're offline — sign-in needs a network connection. Reconnect and try again.
          </div>
        )}
        {stage === 'email' ? (
          <form className={styles.form} onSubmit={(e) => void onSendLink(e)}>
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
              {busy ? 'Sending…' : 'Send link'}
            </Button>
          </form>
        ) : (
          <div className={styles.form}>
            <div role="status" className={styles.hint}>
              Check your email — we sent a sign-in link to <strong>{email}</strong>. Open it on this
              device to sign in. (In dev, see Mailpit.)
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setStage('email');
                resetError();
              }}
              disabled={busy}
            >
              Use a different email
            </Button>
          </div>
        )}
      </div>
    </main>
  );
};
