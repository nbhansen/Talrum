import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react';

import styles from './Chip.module.css';

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean | undefined;
  children: ReactNode;
}

export const Chip = ({ active = false, children, className, ...rest }: ChipProps): JSX.Element => (
  <button
    type="button"
    className={[styles.chip, active && styles.active, className].filter(Boolean).join(' ')}
    {...rest}
  >
    {children}
  </button>
);
