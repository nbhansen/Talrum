import type { JSX } from 'react';

import { ParentShell } from '@/layouts/ParentShell';
import { supabase } from '@/lib/supabase';
import { Button } from '@/ui/Button/Button';

import styles from './BoardNotFound.module.css';

interface BoardNotFoundProps {
  onBack: () => void;
  onKidMode: () => void;
}

export const BoardNotFound = ({ onBack, onKidMode }: BoardNotFoundProps): JSX.Element => (
  <ParentShell
    active="home"
    onKidMode={onKidMode}
    onSignOut={() => {
      void supabase.auth.signOut();
    }}
  >
    <div className={styles.wrap}>
      <h1 className={styles.title}>Board not found</h1>
      <p className={styles.body}>
        This board doesn&rsquo;t exist, or it belongs to another account.
      </p>
      <Button variant="primary" onClick={onBack}>
        Back to boards
      </Button>
    </div>
  </ParentShell>
);
