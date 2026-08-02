import { useEffect, useState } from 'react';
import { ulid } from 'ulid';

import {
  drain,
  getStatus,
  type OutboxStatus,
  refreshStatus,
  resetRetryDelay,
  startOutbox,
  subscribeStatus,
  withCrossTabLock,
} from './drain';
import { runHandler, UnretryableOutboxError } from './handlers';
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
  'id' | 'enqueuedAt' | 'attemptCount' | 'status' | 'lastError' | 'failureKind'
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
 *
 * Every enqueue holds the cross-tab lock from the queue observation through
 * its outcome — the handler run on the fast path, the queue append otherwise
 * (#395). Unlocked, two tabs can both observe an empty queue and run handlers
 * concurrently — the exact double-replay the lock exists to prevent (#278).
 * The appends stay under the lock for the same reason, the offline one
 * included: `online`/`offline` events are per-window, so an offline tab's
 * unlocked append could race an online tab's fast path, which would land a
 * younger write ahead of it (#279's shape, cross-tab). The lock is
 * non-reentrant, so the follow-up `drain()` calls stay outside the callback;
 * the callback reports which follow-up is needed instead.
 *
 * Cost: the lock is held across the handler's IO, blob uploads included, so
 * online writes serialize within a tab and across tabs — a slow photo upload
 * in one tab stalls the other tab's drain and fast path until it settles or
 * its tab dies. A hung request cannot stretch that past the per-run handler
 * timeout (#413, `HANDLER_TIMEOUT_MS` in handlers.ts): the run rejects as
 * transient, the entry joins the queue, and the retry schedule (#391) takes
 * over. Accepted: each landed write leaves the queue empty, so the next
 * waiter still fast-paths, and correctness beats burst latency at this
 * app's write volume.
 */
export const enqueueAndDrain = async (input: EntryInput): Promise<void> => {
  const newEntry = (): OutboxEntry => ({
    ...input,
    id: ulid(),
    enqueuedAt: Date.now(),
    attemptCount: 0,
    status: 'pending',
  });
  const outcome = await withCrossTabLock(
    async (): Promise<'landed' | 'queued-transient' | 'queued-unattempted'> => {
      // Read `onLine` inside the lock: an offline pre-check would sit outside
      // and go seconds stale during the lock wait (same hazard as drain's
      // in-lock re-check); attempting on a dead network burns a retry attempt
      // for nothing. Persist unattempted instead — the drain() below no-ops
      // offline and emits the new pending count.
      const offline = typeof navigator !== 'undefined' && !navigator.onLine;
      if (offline || (await listEntries()).some((e) => e.status === 'pending')) {
        await putEntry(newEntry());
        return 'queued-unattempted';
      }
      const entry = newEntry();
      try {
        await runHandler(entry);
        return 'landed';
      } catch (err) {
        if (err instanceof UnretryableOutboxError) {
          throw err;
        }
        // Transient — join the queue. We intentionally use the same entry
        // (with attemptCount = 1 to reflect the just-failed attempt) so the
        // drain loop respects the retry ceiling.
        await putEntry({
          ...entry,
          attemptCount: 1,
          lastError: err instanceof Error ? err.message : 'unknown error',
        });
        return 'queued-transient';
      }
    },
  );
  if (outcome === 'queued-transient') {
    void drain();
    return;
  }
  if (outcome === 'queued-unattempted') {
    // Flush the queue (oldest first, this entry last). Offline, drain()'s
    // own branch skips the handlers and emits the new pending count instead,
    // so the indicator updates without waiting for the next online/offline
    // event.
    await drain();
  }
};

/**
 * Reset every failed entry to pending (fresh retry budget, fresh retry-timer
 * backoff, stale lastError dropped) and drain. The indicator's "Retry" — a
 * plain `drain()` skips failed entries, so without the reset the button is a
 * no-op (#277).
 *
 * The list-then-put loop runs under the cross-tab lock so a Discard in
 * another tab can't land between the list and the put and get resurrected as
 * pending (#289). `drain()` takes the same (non-reentrant) lock, so it must
 * stay outside the callback.
 *
 * Entries that failed the board conflict guard (`failureKind: 'conflict'`)
 * lose their guard here: their baseline is permanently behind the other
 * device's write, so a guarded retry can only re-conflict. Stripping it turns
 * Retry into "apply my version anyway" — the overwrite #281 forbids is the
 * *silent* one, and the user is choosing it explicitly now. Other failures
 * keep their guard.
 */
export const retryFailed = async (): Promise<void> => {
  await withCrossTabLock(async () => {
    const failed = (await listEntries()).filter((e) => e.status === 'failed');
    for (const { lastError: _lastError, failureKind, ...entry } of failed) {
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
 * Drop a single failed entry from the queue (the indicator's "Discard").
 * Takes the cross-tab lock: an unlocked delete could land inside another
 * tab's `retryFailed` reset loop, which would re-create the entry (#289).
 *
 * Unlike Retry (which ends in `drain()`, which emits), a discard does no
 * draining, so it must push status itself — otherwise the "N failed" pill
 * keeps its stale count until the next unrelated outbox event (#290).
 * refreshStatus stays outside the lock: it only reads IDB and the lock is
 * non-reentrant.
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
