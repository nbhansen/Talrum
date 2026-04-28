import type { CSSProperties, JSX } from 'react';

import styles from './Spinner.module.css';

interface SpinnerProps {
  size?: number;
  /** Override the default `aria-hidden`; pass an a11y label to make it announce. */
  label?: string;
}

export const Spinner = ({ size, label }: SpinnerProps): JSX.Element => {
  const style = size ? ({ '--tal-spinner-size': `${size}px` } as CSSProperties) : undefined;
  if (label) {
    return <span role="progressbar" aria-label={label} className={styles.spinner} style={style} />;
  }
  return <span aria-hidden="true" className={styles.spinner} style={style} />;
};
