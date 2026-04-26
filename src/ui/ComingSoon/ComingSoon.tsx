import type { JSX } from 'react';

import styles from './ComingSoon.module.css';

interface ComingSoonProps {
  body: string;
}

export const ComingSoon = ({ body }: ComingSoonProps): JSX.Element => (
  <div className={styles.wrap} role="status">
    <p className={styles.body}>{body}</p>
  </div>
);
