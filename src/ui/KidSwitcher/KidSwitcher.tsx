import type { JSX } from 'react';

import type { Kid } from '@/types/domain';

import styles from './KidSwitcher.module.css';

interface KidSwitcherProps {
  kids: readonly Kid[];
  activeKidId: string | null;
  onSelect: (kidId: string) => void;
}

/** Always renders if mounted — hiding it for one-kid families is the caller's job. */
export const KidSwitcher = ({ kids, activeKidId, onSelect }: KidSwitcherProps): JSX.Element => (
  <div className={styles.row} role="tablist" aria-label="Switch active kid">
    {kids.map((kid) => {
      const isActive = kid.id === activeKidId;
      return (
        <button
          key={kid.id}
          type="button"
          role="tab"
          aria-selected={isActive}
          className={[styles.pill, isActive && styles.pillActive].filter(Boolean).join(' ')}
          onClick={() => onSelect(kid.id)}
        >
          {kid.name}
        </button>
      );
    })}
  </div>
);
