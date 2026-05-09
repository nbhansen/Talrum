import type { JSX } from 'react';

import type { Kid } from '@/types/domain';

import styles from './KidSwitcher.module.css';

interface KidSwitcherProps {
  kids: readonly Kid[];
  activeKidId: string | null;
  onSelect: (kidId: string) => void;
}

/**
 * Pill row of kids — used in parent home when more than one kid exists, so
 * the parent can flip the boards filter without leaving the page. Hidden
 * entirely for single-kid families (the caller decides; this component
 * always renders if mounted).
 */
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
