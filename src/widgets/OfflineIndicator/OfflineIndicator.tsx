import type { JSX } from 'react';

import { discardEntry, peekEntries, retryFailed, useOutboxStatus } from '@/lib/outbox';

import styles from './OfflineIndicator.module.css';

const discardAllFailed = async (): Promise<void> => {
  const entries = await peekEntries();
  await Promise.all(entries.filter((e) => e.status === 'failed').map((e) => discardEntry(e.id)));
};

/**
 * Small status pill, mounted once by `ParentShell` above the page header so it
 * shows on every parent screen (#354). Renders nothing when the world is
 * boring — online and the outbox is clean. When there's something to say it
 * shows the offline state, the pending count, or a "X sync failed" actionable
 * row with Retry + Discard.
 */
export const OfflineIndicator = (): JSX.Element | null => {
  const { online, pendingCount, failedCount, conflictCount, draining, timerDrain } =
    useOutboxStatus();

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

  // Online + (draining or pending): syncing. Timer-driven re-drains (#391)
  // keep the queued label (#409): each one would otherwise flip the text
  // queued → Syncing… → queued, and this polite live region re-announces on
  // every text change — a one-minute outage reads out about six times.
  // "Syncing…" stays for user- and event-driven drains only — and for a
  // timer drain that wakes to a queue another tab already emptied, where
  // the steady label would read "Sync queued · 0" for one emit before the
  // pill unmounts.
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
