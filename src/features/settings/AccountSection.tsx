import { type JSX, useState } from 'react';

import { useSignOut, useUserEmail } from '@/lib/auth/session';

import styles from './AccountSection.module.css';

export const AccountSection = (): JSX.Element => {
  const email = useUserEmail();
  const signOut = useSignOut();
  const [pending, setPending] = useState(false);

  const handleSignOut = (): void => {
    setPending(true);
    void signOut().finally(() => setPending(false));
  };

  return (
    <section>
      <h2>Signed in</h2>
      {email && (
        <p className={styles.email}>
          You are signed in as <span className={styles.emailValue}>{email}</span>.
        </p>
      )}
      <button type="button" className={styles.signOut} onClick={handleSignOut} disabled={pending}>
        {pending ? 'Signing out…' : 'Sign out'}
      </button>
    </section>
  );
};
