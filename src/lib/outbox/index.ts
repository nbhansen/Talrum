import { useEffect, useState } from 'react';
import { ulid } from 'ulid';

import { captureException } from '@/lib/platform/telemetry';

import {
  drain,
  getStatus,
  type OutboxStatus,
  reconcileQueue,
  refreshStatus,
  resetRetryDelay,
  startOutbox,
  subscribeStatus,
  withCrossTabLock,
} from './drain';
import { runHandler, UnretryableOutboxError } from './handlers';
import { getOutboxOwner, setOwnerId } from './owner';
import { deleteEntry, listEntries, putEntry } from './store';
import type { OutboxEntry } from './types';

export type { BoardRowPatch, OutboxEntry, OutboxEntryStatus } from './types';
export { startOutbox, UnretryableOutboxError };

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
 * Run IDB bookkeeping that must not decide a write's outcome (#446): a device
 * that cannot write IndexedDB must keep making online writes. Takes a thunk so
 * a synchronous throw cannot bypass the catch. Reports whether the work ran.
 */
const bestEffort = async (op: string, work: () => Promise<void>): Promise<boolean> => {
  try {
    await work();
    return true;
  } catch (err) {
    captureException(err, { level: 'warning', tags: { component: 'outbox', op } });
    return false;
  }
};

/**
 * Distributed over the union so caller payloads keep their per-kind required
 * fields. A plain `Omit<OutboxEntry, ...>` collapses to the common props.
 */
type DistributiveOmit<T, K extends keyof OutboxEntry> = T extends OutboxEntry ? Omit<T, K> : never;
type EntryInput = DistributiveOmit<
  OutboxEntry,
  'id' | 'enqueuedAt' | 'attemptCount' | 'status' | 'lastError' | 'failureKind'
>;

/**
 * The hot path for every mutation. Online with an empty queue: persist, run the
 * handler, delete. Otherwise the entry joins the queue and a drain flushes it in
 * FIFO order, because a write that jumps older ones loses to them (#279).
 */
export const enqueueAndDrain = async (input: EntryInput): Promise<void> => {
  // Read at call time, never inside `run`. `run` executes after the lock wait,
  // and the auth boundary is what moves during that wait (#446).
  const owner = getOutboxOwner();
  const newEntry = (): OutboxEntry => {
    const base = {
      ...input,
      id: ulid(),
      enqueuedAt: Date.now(),
      attemptCount: 0,
      status: 'pending' as const,
    };
    // Added rather than set, because `exactOptionalPropertyTypes` forbids an
    // explicit `undefined`.
    return owner === null ? base : { ...base, enqueuedBy: owner };
  };
  const run = async (): Promise<'landed' | 'queued-transient' | 'queued-unattempted'> => {
    // The account changed during the lock wait, so this write belongs to a user
    // who is gone. Abandon it and let React Query roll the patch back.
    if (getOutboxOwner() !== owner) {
      throw new Error('Signed-in account changed before the write started.');
    }
    // Reconcile before the check below: inside the lock an `attempting` entry
    // has no live owner, and promoting it must be visible here or this write
    // fast-paths past an older one (#279).
    const entries = await reconcileQueue();
    // Read `onLine` inside the lock. A pre-check goes stale during the wait,
    // and attempting on a dead network burns a retry attempt for nothing.
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    if (offline || entries.some((e) => e.status === 'pending')) {
      await putEntry(newEntry());
      return 'queued-unattempted';
    }
    const entry: OutboxEntry = { ...newEntry(), status: 'attempting' };
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
      const attempted: OutboxEntry = {
        ...entry,
        // Records the burnt attempt so the drain respects the retry ceiling.
        status: 'pending',
        attemptCount: 1,
        lastError: err instanceof Error ? err.message : 'unknown error',
      };
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
  await withCrossTabLock(async () => {
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
  });
  resetRetryDelay();
  await drain();
};

/**
 * Drop one failed entry — the indicator's "Discard". Under the lock, or the
 * delete lands inside another tab's `retryFailed` loop and is re-created
 * (#289). Pushes status itself because nothing here drains (#290).
 */
export const discardEntry = async (id: string): Promise<void> => {
  await withCrossTabLock(() => deleteEntry(id));
  await refreshStatus();
};

export const peekEntries = listEntries;

export const useOutboxStatus = (): OutboxStatus => {
  const [status, setStatus] = useState<OutboxStatus>(getStatus());
  useEffect(() => subscribeStatus(setStatus), []);
  return status;
};
