import type { JSX } from 'react';

import { useKids } from '@/lib/queries/kids';
import { Button } from '@/ui/Button/Button';
import { EmptyState } from '@/ui/EmptyState/EmptyState';
import { PlusIcon } from '@/ui/icons';

import styles from './Kids.module.css';

interface KidsProps {
  onNewKid?: () => void;
}

export const Kids = ({ onNewKid }: KidsProps): JSX.Element => {
  const { data: kids = [] } = useKids();

  if (kids.length === 0) {
    return (
      <EmptyState
        title="No kids yet"
        body="Add a kid to start creating boards for them. Each kid has their own boards."
        action={
          <Button variant="primary" icon={<PlusIcon />} onClick={onNewKid}>
            Add your first kid
          </Button>
        }
      />
    );
  }

  return (
    <ul className={styles.list}>
      {kids.map((kid) => (
        <li key={kid.id} className={styles.row}>
          <span className={styles.name}>{kid.name}</span>
        </li>
      ))}
    </ul>
  );
};
