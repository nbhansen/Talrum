import type { JSX, ReactNode } from 'react';

import styles from './FormError.module.css';

interface FormErrorProps {
  children: ReactNode;
  /** Adds a top margin, for an error that follows a field in block flow. */
  spaced?: boolean;
}

// A div, not a p: the upload dropzone renders one inside its button.
export const FormError = ({ children, spaced = false }: FormErrorProps): JSX.Element => (
  <div role="alert" className={spaced ? `${styles.error} ${styles.spaced}` : styles.error}>
    {children}
  </div>
);
