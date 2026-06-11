import { useEffect, useState } from 'react';
import { ulid } from 'ulid';

import {
  drain,
  getStatus,
  type OutboxStatus,
  refreshStatus,
  startOutbox,
  subscribeStatus,
  withCrossTabLock,
} from './drain';
import { BOARD_CONFLICT_MESSAGE, runHandler, UnretryableOutboxError } from './handlers';
import { deleteEntry, listEntries, putEntry } from './store';
import type { OutboxEntry } from './types';

export type { BoardRowPatch, OutboxEntry, OutboxEntryStatus } from './types';
export { startOutbox, UnretryableOutboxError };

/**
 * Distribute the Omit over each member of the union so caller payloads keep
 * their per-kind required fields. A plain `Omit<OutboxEntry, ...>` collapses
 * to the intersection of common props, dropping `boardId`, `pictogramId`,
 * `blob`, etc.
 */
type DistributiveOmit<T, K extends keyof OutboxEntry> = T extends OutboxEntry ? Omit<T, K> : never;
type EntryInput = DistributiveOmit<
  OutboxEntry,
  'id' | 'enqueuedAt' | 'attemptCount' | 'status' | 'lastError'
>;

/**
 * The hot path for every mutation. Online: try the handler immediately; on
 * success the optimistic patch in the cache becomes durable with no IDB
 * detour. On a network failure, persist the entry and let the drain loop
 * retry. On a permanent failure (RLS, validation), reject so React Query's
 * onError rolls the optimistic patch back.
 *
 * Offline: skip the immediate attempt — persist the entry and resolve. The
 * UI keeps the optimistic state; the drain loop replays when `online` fires.
 *
 * The fast path requires an empty pending queue: a write that bypasses older
 * queued entries gets overwritten when they replay — stale data wins (#279).
 * In that case the write joins the queue and a drain flushes everything in
 * FIFO order. Failed entries don't count — drain() skips them, so they'd
 * block the fast path forever for nothing.
 */
export const enqueueAndDrain = async (input: EntryInput): Promise<void> => {
  const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
  const hasPendingBacklog = isOnline && (await listEntries()).some((e) => e.status === 'pending');
  if (isOnline && !hasPendingBacklog) {
    const entry: OutboxEntry = {
      ...input,
      id: ulid(),
      enqueuedAt: Date.now(),
      attemptCount: 0,
      status: 'pending',
    };
    try {
      await runHandler(entry);
      return;
    } catch (err) {
      if (err instanceof UnretryableOutboxError) {
        throw err;
      }
      // Transient — fall through to the queue. We intentionally use the same
      // entry (with attemptCount = 1 to reflect the just-failed attempt) so
      // the drain loop respects the retry ceiling.
      await putEntry({
        ...entry,
        attemptCount: 1,
        lastError: err instanceof Error ? err.message : 'unknown error',
      });
      void drain();
      return;
    }
  }
  await putEntry({
    ...input,
    id: ulid(),
    enqueuedAt: Date.now(),
    attemptCount: 0,
    status: 'pending',
  });
  if (isOnline) {
    // Online with a backlog: flush the queue (oldest first, this entry last).
    await drain();
    return;
  }
  // The offline path doesn't call drain() (which is what normally emits),
  // so the indicator wouldn't update its pending count until the next
  // online/offline event. Push the new status now.
  await refreshStatus();
};

/**
 * Reset every failed entry to pending (fresh retry budget, stale lastError
 * dropped) and drain. The indicator's "Retry" — a plain `drain()` skips
 * failed entries, so without the reset the button is a no-op (#277).
 *
 * The list-then-put loop runs under the cross-tab lock so a Discard in
 * another tab can't land between the list and the put and get resurrected as
 * pending (#289). `drain()` takes the same (non-reentrant) lock, so it must
 * stay outside the callback.
 *
 * Entries that failed the board conflict guard lose their guard here: their
 * baseline is permanently behind the other device's write, so a guarded
 * retry can only re-conflict. Stripping it turns Retry into "apply my
 * version anyway" — the overwrite #281 forbids is the *silent* one, and the
 * user is choosing it explicitly now. Other failures keep their guard.
 */
export const retryFailed = async (): Promise<void> => {
  await withCrossTabLock(async () => {
    const failed = (await listEntries()).filter((e) => e.status === 'failed');
    for (const { lastError, ...entry } of failed) {
      if (entry.kind === 'updateBoard' && lastError === BOARD_CONFLICT_MESSAGE) {
        delete entry.expectedUpdatedAt;
      }
      await putEntry({ ...entry, status: 'pending', attemptCount: 0 });
    }
  });
  await drain();
};

/**
 * Drop a single failed entry from the queue (the indicator's "Discard").
 * Takes the cross-tab lock: an unlocked delete could land inside another
 * tab's `retryFailed` reset loop, which would re-create the entry (#289).
 *
 * Unlike Retry (which ends in `drain()`, which emits), a discard does no
 * draining, so it must push status itself — otherwise the "N failed" pill
 * keeps its stale count until the next unrelated outbox event (#290). Mirrors
 * the offline-enqueue path in `enqueueAndDrain`. refreshStatus stays outside
 * the lock: it only reads IDB and the lock is non-reentrant.
 */
export const discardEntry = async (id: string): Promise<void> => {
  await withCrossTabLock(() => deleteEntry(id));
  await refreshStatus();
};

/** Inspect the queue (e.g. to render a per-entry error list). */
export const peekEntries = listEntries;

export const useOutboxStatus = (): OutboxStatus => {
  const [status, setStatus] = useState<OutboxStatus>(getStatus());
  useEffect(() => subscribeStatus(setStatus), []);
  return status;
};
