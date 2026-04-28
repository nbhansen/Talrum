import type { JSX, ReactNode } from 'react';

import styles from './DialogActions.module.css';

interface DialogActionsProps {
  children: ReactNode;
}

export const DialogActions = ({ children }: DialogActionsProps): JSX.Element => (
  <div className={styles.actions}>{children}</div>
);
