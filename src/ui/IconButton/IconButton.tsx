import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react';

import styles from './IconButton.module.css';

interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label' | 'children'
> {
  'aria-label': string;
  children: ReactNode;
  /** Glyph circle: sm = 24px, md = 32px. The hit box is always --tal-tap-min. */
  size?: 'sm' | 'md';
  variant?: 'quiet' | 'raised';
}

export const IconButton = ({
  children,
  size = 'md',
  variant = 'quiet',
  className,
  type = 'button',
  ...rest
}: IconButtonProps): JSX.Element => (
  <button
    type={type}
    className={[styles.root, styles[size], styles[variant], className].filter(Boolean).join(' ')}
    {...rest}
  >
    <span className={styles.glyph}>{children}</span>
  </button>
);
