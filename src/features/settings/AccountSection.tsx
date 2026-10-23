import { type JSX, useState } from 'react';

import { useSignOut, useUserEmail } from '@/lib/auth/session';
import { Button } from '@/ui/Button/Button';

import styles from './AccountSection.module.css';

export const AccountSection = (): JSX.Element => {
  const email = useUserEmail();
  const signOut = useSignOut();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  // On success AuthGate unmounts this section, so only a failure needs state.
  const handleSignOut = (): void => {
    setPending(true);
    setFailed(false);
    signOut().catch(() => {
      setFailed(true);
      setPending(false);
    });
  };

  return (
    <section>
      <h2>Signed in</h2>
      {email && (
        <p className={styles.email}>
          You are signed in as <span className={styles.emailValue}>{email}</span>.
        </p>
      )}
      <div className={styles.actions}>
        <Button variant="ghost" onClick={handleSignOut} disabled={pending}>
          {pending ? 'Signing out…' : 'Sign out'}
        </Button>
      </div>
      {failed && (
        <p role="alert" className={styles.error}>
          Could not sign out. Check your connection and try again.
        </p>
      )}
    </section>
  );
};
