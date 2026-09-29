import type { JSX, ReactNode } from 'react';

import styles from './FormError.module.css';

interface FormErrorProps {
  children: ReactNode;
  /** Placement only, such as a top margin in block flow. */
  className?: string | undefined;
}

// A div, not a p: the upload dropzone renders one inside its button.
export const FormError = ({ children, className }: FormErrorProps): JSX.Element => (
  <div role="alert" className={className ? `${styles.error} ${className}` : styles.error}>
    {children}
  </div>
);
