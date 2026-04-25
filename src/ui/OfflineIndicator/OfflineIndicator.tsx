import type { JSX } from 'react';

import { discardEntry, kick, peekEntries, useOutboxStatus } from '@/lib/outbox';

import styles from './OfflineIndicator.module.css';

const discardAllFailed = async (): Promise<void> => {
  const entries = await peekEntries();
  await Promise.all(entries.filter((e) => e.status === 'failed').map((e) => discardEntry(e.id)));
  await kick();
};

/**
 * Small status pill in the parent sidebar. Renders nothing when the world is
 * boring — online and the outbox is clean. When there's something to say it
 * shows the offline state, the pending count, or a "X sync failed" actionable
 * row with Retry + Discard.
 */
export const OfflineIndicator = (): JSX.Element | null => {
  const { online, pendingCount, failedCount, draining } = useOutboxStatus();

  if (online && pendingCount === 0 && failedCount === 0 && !draining) return null;

  if (failedCount > 0) {
    return (
      <div role="status" className={`${styles.pill} ${styles.pillFailed}`}>
        <span className={styles.label}>
          {failedCount} sync {failedCount === 1 ? 'change' : 'changes'} failed
        </span>
        <button type="button" className={styles.action} onClick={() => void kick()}>
          Retry
        </button>
        <button type="button" className={styles.action} onClick={() => void discardAllFailed()}>
          Discard
        </button>
      </div>
    );
  }

  if (!online) {
    return (
      <div role="status" className={`${styles.pill} ${styles.pillOffline}`}>
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.label}>
          Offline{pendingCount > 0 ? ` · ${pendingCount} pending` : ''}
        </span>
      </div>
    );
  }

  // Online + (draining or pending): syncing.
  return (
    <div role="status" className={`${styles.pill} ${styles.pillSyncing}`}>
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.label}>
        {draining ? 'Syncing…' : `Sync queued · ${pendingCount}`}
      </span>
    </div>
  );
};
