import type { JSX } from 'react';

import styles from './BoardErrorBanner.module.css';

interface Props {
  onRetry: () => void;
  onDismiss: () => void;
}

export const BoardErrorBanner = ({ onRetry, onDismiss }: Props): JSX.Element => (
  <div role="alert" className={styles.banner}>
    <span className={styles.message}>Couldn&apos;t save change. Try again.</span>
    <button type="button" className={styles.retry} onClick={onRetry}>
      Retry
    </button>
    <button type="button" className={styles.dismiss} onClick={onDismiss}>
      Dismiss
    </button>
  </div>
);
