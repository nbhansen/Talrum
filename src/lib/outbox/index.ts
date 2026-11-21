import { useSyncExternalStore } from 'react';
import { ulid } from 'ulid';

import { bestEffort, bestEffortRead } from './best-effort';
import {
  drain,
  entryAfterFailure,
  getStatus,
  hasQueuedWrites,
  onQueueFlushed,
  type OutboxStatus,
  reconcileQueue,
  refreshStatus,
  resetRetrySchedule,
  startOutbox,
  subscribeStatus,
  withCrossTabLock,
} from './drain';
import { runHandler, UnretryableOutboxError } from './handlers';
import { isOnline } from './online';
import { getOutboxOwner, setOwnerId } from './owner';
import { deleteEntry, listEntries, putEntry } from './store';
import type { OutboxEntry, OutboxEntryBase } from './types';

export { OUTBOX_KEY_PREFIX } from './store';
export type { BoardRowPatch } from './types';
export { hasQueuedWrites, onQueueFlushed, startOutbox };

/**
 * Tell the outbox which account it works for. Draining is gated on a known
 * owner and `startOutbox` runs before the session resolves, so this call is
 * what runs the drain the new session is owed.
 */
export const setOutboxOwner = (id: string | null): void => {
  const changed = getOutboxOwner() !== id;
  setOwnerId(id);
  if (changed && id !== null) void drain();
};

/**
 * Distributed over the union so caller payloads keep their per-kind required
 * fields. A plain `Omit<OutboxEntry, ...>` collapses to the common props.
 */
type DistributiveOmit<T, K extends keyof OutboxEntry> = T extends OutboxEntry ? Omit<T, K> : never;
type EntryInput = DistributiveOmit<OutboxEntry, keyof OutboxEntryBase>;

/**
 * The hot path for every mutation. Online with an empty queue: persist, run the
 * handler, delete. Otherwise the entry joins the queue and a drain flushes it in
 * FIFO order, because a write that jumps older ones loses to them (#279).
 */
export const enqueueAndDrain = async (input: EntryInput): Promise<void> => {
  // Read at call time, never inside `run`. `run` executes after the lock wait,
  // and the auth boundary is what moves during that wait (#446).
  const owner = getOutboxOwner();
  const run = async (): Promise<'landed' | 'queued-transient' | 'queued-unattempted'> => {
    // The account changed during the lock wait, so this write belongs to a user
    // who is gone. Abandon it and let React Query roll the patch back.
    if (getOutboxOwner() !== owner) {
      throw new Error('Signed-in account changed before the write started.');
    }
    // Reconcile before the check below: inside the lock an `attempting` entry
    // has no live owner, and promoting it must be visible here or this write
    // fast-paths past an older one (#279).
    const entries = await bestEffortRead('reconcile-before-write', reconcileQueue);
    // Read `onLine` inside the lock: a pre-check goes stale during the wait.
    // An unreadable queue is not an empty queue: the fast path would run this
    // write ahead of entries it cannot see, and they overwrite it on replay
    // (#279, #458).
    const attemptNow =
      isOnline() && entries !== undefined && !entries.some((e) => e.status === 'pending');
    const entry: OutboxEntry = {
      ...input,
      id: ulid(),
      enqueuedAt: Date.now(),
      attemptCount: 0,
      status: attemptNow ? 'attempting' : 'pending',
      ...(owner === null ? {} : { enqueuedBy: owner }),
    };
    if (!attemptNow) {
      // Unguarded: #445 needs this put to reject.
      await putEntry(entry);
      return 'queued-unattempted';
    }
    // Persist before the attempt (#445): the round trip is a window in which
    // the page can go away, and an entry that lives only in memory goes with
    // it. `attempting`, not `pending` — this write awaits no drain (#446).
    const queued = await bestEffort('persist-before-attempt', () => putEntry(entry));
    try {
      await runHandler(entry);
    } catch (err) {
      if (err instanceof UnretryableOutboxError) {
        // The mutation rejects and the optimistic patch rolls back, so the
        // entry must not stay behind.
        await bestEffort('delete-after-permanent-failure', () => deleteEntry(entry.id));
        throw err;
      }
      // Records the burnt attempt so the drain respects the retry ceiling.
      const attempted = entryAfterFailure(entry, err);
      // With the entry already queued this put only records the attempt, which
      // the drain does not need. Without it, this put is the queue's only
      // record of the write and must be allowed to fail (#445).
      if (queued) {
        await bestEffort('record-transient-attempt', () => putEntry(attempted));
      } else {
        await putEntry(attempted);
      }
      return 'queued-transient';
    }
    // Outside the try: a failed delete is not a failed handler. Inside, it took
    // the transient branch and replayed a write the server had accepted (#446).
    await bestEffort('delete-after-landing', () => deleteEntry(entry.id));
    return 'landed';
  };

  const outcome = await withCrossTabLock(run);
  if (outcome === 'queued-transient') {
    void drain();
    return;
  }
  if (outcome === 'queued-unattempted') {
    // Offline this skips the handlers and emits the new pending count, so the
    // indicator updates without waiting for the next online event.
    await drain();
  }
};

/**
 * Reset every failed entry to pending and drain — the indicator's "Retry".
 * A plain `drain()` skips failed entries, so without the reset the button does
 * nothing (#277). Under the lock, or a Discard between the list and the put is
 * resurrected as pending (#289).
 */
export const retryFailed = async (): Promise<void> => {
  // The button's only caller drops the promise, so a rejection here reached
  // nobody (#462). The drain below reads again and feeds the status.
  await bestEffort('retry-list-entries', () =>
    withCrossTabLock(async () => {
      const failed = (await listEntries()).filter((e) => e.status === 'failed');
      for (const { lastError: _lastError, failureKind, ...entry } of failed) {
        // A conflicted baseline is permanently behind, so a guarded retry can
        // only re-conflict. Retry becomes "apply mine anyway": #281 forbids the
        // silent overwrite, and this one is explicit.
        if (entry.kind === 'updateBoard' && failureKind === 'conflict') {
          delete entry.expectedUpdatedAt;
        }
        await putEntry({ ...entry, status: 'pending', attemptCount: 0 });
      }
    }),
  );
  resetRetrySchedule();
  await drain();
};

/**
 * Drop every failed entry — the indicator's "Discard". List and delete under
 * one lock, or another tab's Retry between them is discarded (#289). Pushes
 * status itself because nothing here drains (#290).
 */
export const discardFailed = async (): Promise<void> => {
  await withCrossTabLock(async () => {
    const failed = (await listEntries()).filter((e) => e.status === 'failed');
    for (const { id } of failed) await deleteEntry(id);
  });
  await refreshStatus();
};

export const useOutboxStatus = (): OutboxStatus => useSyncExternalStore(subscribeStatus, getStatus);
