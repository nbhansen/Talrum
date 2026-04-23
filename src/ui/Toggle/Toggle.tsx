import type { JSX } from 'react';

import styles from './Toggle.module.css';

interface ToggleProps {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}

export const Toggle = ({ label, value, onChange }: ToggleProps): JSX.Element => (
  <button
    type="button"
    role="switch"
    aria-checked={value}
    className={styles.toggle}
    onClick={() => onChange(!value)}
  >
    <span className={[styles.track, value && styles.trackOn].filter(Boolean).join(' ')}>
      <span className={[styles.thumb, value && styles.thumbOn].filter(Boolean).join(' ')} />
    </span>
    {label}
  </button>
);
