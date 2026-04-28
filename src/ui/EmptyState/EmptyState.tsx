import type { JSX, ReactNode } from 'react';

import styles from './EmptyState.module.css';

interface EmptyStateProps {
  title: string;
  body: string;
  action?: ReactNode;
}

export const EmptyState = ({ title, body, action }: EmptyStateProps): JSX.Element => (
  <div className={styles.wrap} role="status">
    <h2 className={styles.title}>{title}</h2>
    <p className={styles.body}>{body}</p>
    {action}
  </div>
);
