import type { JSX } from 'react';

import type { Kid } from '@/types/domain';

import { rovingKeyDown } from '../rovingKeys';
import styles from './KidSwitcher.module.css';

interface KidSwitcherProps {
  kids: readonly Kid[];
  activeKidId: string | null;
  onSelect: (kidId: string) => void;
}

/** Always renders if mounted — hiding it for one-kid families is the caller's job. */
export const KidSwitcher = ({ kids, activeKidId, onSelect }: KidSwitcherProps): JSX.Element => (
  <div
    className={styles.row}
    role="radiogroup"
    aria-label="Switch active kid"
    onKeyDown={(e) =>
      rovingKeyDown(
        e,
        'radio',
        kids.map((k) => k.id),
        activeKidId,
        onSelect,
      )
    }
  >
    {kids.map((kid, i) => {
      const isActive = kid.id === activeKidId;
      return (
        <button
          key={kid.id}
          type="button"
          role="radio"
          aria-checked={isActive}
          tabIndex={isActive || (activeKidId === null && i === 0) ? 0 : -1}
          className={[styles.pill, isActive && styles.pillActive].filter(Boolean).join(' ')}
          onClick={() => onSelect(kid.id)}
        >
          {kid.name}
        </button>
      );
    })}
  </div>
);
