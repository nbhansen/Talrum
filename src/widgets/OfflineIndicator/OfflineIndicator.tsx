import type { JSX } from 'react';

import { discardEntry, peekEntries, retryFailed, useOutboxStatus } from '@/lib/outbox';

import styles from './OfflineIndicator.module.css';

const discardAllFailed = async (): Promise<void> => {
  const entries = await peekEntries();
  await Promise.all(entries.filter((e) => e.status === 'failed').map((e) => discardEntry(e.id)));
};

/**
 * Status pill, mounted once by `ParentShell` so it shows on every parent
 * screen (#354). Renders nothing when online with a clean outbox.
 */
export const OfflineIndicator = (): JSX.Element | null => {
  const {
    online,
    pendingCount,
    failedCount,
    conflictCount,
    draining,
    timerDrain,
    queueUnreadable,
  } = useOutboxStatus();

  // Before every other branch: the counts are stale, and a Retry could not
  // read the entries it would reset (#462).
  if (queueUnreadable) {
    return (
      <div role="status" className={`${styles.pill} ${styles.pillFailed}`}>
        <span className={styles.label}>
          Sync is not working on this device · recent changes may not be saved
        </span>
      </div>
    );
  }

  if (online && pendingCount === 0 && failedCount === 0 && !draining) return null;

  if (failedCount > 0) {
    return (
      <div role="status" className={`${styles.pill} ${styles.pillFailed}`}>
        <span className={styles.label}>
          {failedCount} sync {failedCount === 1 ? 'change' : 'changes'} failed
          {/* Name the conflict (#281): for these entries Retry means "apply
              my version anyway", so the label must say what happened. */}
          {conflictCount > 0 ? ' — board changed on another device' : ''}
        </span>
        <button type="button" className={styles.action} onClick={() => void retryFailed()}>
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

  // Timer-driven re-drains keep the queued label (#409). Flipping to
  // "Syncing…" and back re-announces this polite live region on every backoff
  // cycle — about six times in a one-minute outage. The cost is that a
  // recovering timer drain reads "Sync queued · N" until the end emit.
  return (
    <div role="status" className={`${styles.pill} ${styles.pillSyncing}`}>
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.label}>
        {draining && (!timerDrain || pendingCount === 0)
          ? 'Syncing…'
          : `Sync queued · ${pendingCount}`}
      </span>
    </div>
  );
};
