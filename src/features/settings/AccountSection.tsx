import { type JSX, useState } from 'react';

import { performSignOut, useUserEmail } from '@/lib/auth/session';
import { Button } from '@/ui/Button/Button';

import styles from './AccountSection.module.css';
import shared from './settings.module.css';

export const AccountSection = (): JSX.Element => {
  const email = useUserEmail();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  // On success AuthGate unmounts this section, so only a failure needs state.
  const handleSignOut = (): void => {
    setPending(true);
    setFailed(false);
    performSignOut().catch(() => {
      setFailed(true);
      setPending(false);
    });
  };

  return (
    <section>
      <h2>Signed in</h2>
      {email && (
        <p className={shared.muted}>
          You are signed in as <span className={shared.strong}>{email}</span>.
        </p>
      )}
      <div className={shared.row}>
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
