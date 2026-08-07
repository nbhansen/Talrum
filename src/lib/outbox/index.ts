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
 * Tell the outbox which account it is working for. AuthGate calls this from
 * the same `onAuthStateChange` listener that triggers the sign-out sweep, so
 * the queue and the auth boundary cannot disagree about who owns what.
 *
 * Draining is gated on an owner being known, and `startOutbox` runs at module
 * load — before the session resolves — so the drain it attempts is a no-op.
 * This is what runs the one the new session is owed.
 */
export const setOutboxOwner = (id: string | null): void => {
  const changed = getOutboxOwner() !== id;
  setOwnerId(id);
  if (changed && id !== null) void drain();
};

/**
 * IDB bookkeeping that must never decide the outcome of a write. The queue
 * is how a write survives a crash, not how it succeeds: a device that cannot
 * write IndexedDB must keep making online writes exactly as it did before
 * (#446 review). These failures are all recoverable — a lost pre-attempt
 * entry costs the crash window, a lost delete costs one idempotent replay,
 * lost retry bookkeeping costs an attempt count — so they go to telemetry
 * and the write carries on. Returns whether the work succeeded, because one
 * caller has to know: a put that is the queue's *only* record of the write
 * is not bookkeeping, and must be allowed to fail the mutation.
 *
 * Takes a thunk, not a promise: an eager argument is evaluated at the call
 * site, so a synchronous throw would bypass this catch and reject the
 * mutation — the one outcome the helper exists to prevent (#446 review).
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
 * The hot path for every mutation. Online: persist the entry, try the
 * handler immediately, and delete the entry on success. On a network
 * failure, keep the entry and let the drain loop retry. On a permanent
 * failure (RLS, validation), delete it and reject so React Query's onError
 * rolls the optimistic patch back.
 *
 * The write comes first because the handler's round trip is a window in
 * which the page can go away (#445). Before, the fast path ran the handler
 * with nothing in IDB, so a reload or a tab close during that round trip
 * dropped the entry and the optimistic patch together and the write was
 * gone without a trace. The put is best effort: a device that cannot write
 * IndexedDB keeps the availability it had before, and the failure goes to
 * telemetry.
 *
 * The cost is one IDB put and one delete on every online write. The entry
 * carries `status: 'attempting'` throughout, which is what keeps that cheap:
 * `emit()` and `refreshStatus()` read the queue unlocked, but neither counts
 * an attempt, and the drain loop's filter skips it — so no exit path has to
 * correct a status or schedule a follow-up. An abandoned attempt is adopted
 * by the next lock holder (`reconcileQueue`, drain.ts), which also drops any
 * entry belonging to a different account. Where `navigator.locks`
 * is missing, `withCrossTabLock` runs unlocked and that adoption is no longer
 * exact; handlers are idempotent for exactly this class.
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
 * its tab dies. A hung request cannot stretch that past the per-kind
 * handler timeout (#413, handlers.ts): the run rejects as transient, the
 * entry joins the queue, and the retry schedule (#391) takes over. Accepted: each landed write leaves the queue empty, so the next
 * waiter still fast-paths, and correctness beats burst latency at this
 * app's write volume.
 */
export const enqueueAndDrain = async (input: EntryInput): Promise<void> => {
  // Captured here, at call time, and never re-read inside `run`. `run` is the
  // lock callback, so it executes *after* the lock wait — and the auth
  // boundary is exactly what changes during that wait. Reading it there would
  // stamp user A's write with user B, which is the entry the stamp exists to
  // catch (#446 review).
  const owner = getOutboxOwner();
  const newEntry = (): OutboxEntry => {
    const base = {
      ...input,
      id: ulid(),
      enqueuedAt: Date.now(),
      attemptCount: 0,
      status: 'pending' as const,
    };
    // Added rather than always set, because `exactOptionalPropertyTypes`
    // forbids an explicit `undefined`.
    return owner === null ? base : { ...base, enqueuedBy: owner };
  };
  const run = async (): Promise<'landed' | 'queued-transient' | 'queued-unattempted'> => {
    // The account changed while this write queued for the lock, so the user
    // it belongs to is gone. Writing the entry now would leave user A's
    // payload on the device for user B, and the handler would fail under
    // RLS anyway. Abandon it and let React Query roll the patch back.
    if (getOutboxOwner() !== owner) {
      throw new Error('Signed-in account changed before the write started.');
    }
    // Inside the lock, so an `attempting` entry left by a page that went away
    // has no live owner. Reconcile before the check below, or this write
    // would fast-path straight past an older one (#279's shape). It also drops
    // entries this session did not enqueue. The queue it returns is the one
    // the check reads, so neither costs an extra round trip.
    const entries = await reconcileQueue();
    // Read `onLine` inside the lock: an offline pre-check would sit outside
    // and go seconds stale during the lock wait (same hazard as drain's
    // in-lock re-check); attempting on a dead network burns a retry attempt
    // for nothing. Persist unattempted instead — the drain() below no-ops
    // offline and emits the new pending count.
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    if (offline || entries.some((e) => e.status === 'pending')) {
      await putEntry(newEntry());
      return 'queued-unattempted';
    }
    const entry: OutboxEntry = { ...newEntry(), status: 'attempting' };
    // Persist before the attempt (#445). The handler's round trip is a
    // window in which the page can go away — a reload, a tab close — and
    // an entry that lives only in memory goes with it. The optimistic
    // cache patch does not survive either, so the write vanishes with no
    // queue entry, no error, and nothing for the user to retry.
    //
    // `attempting`, not `pending`: this write is not waiting for a drain,
    // it is being run right now. That distinction is what keeps the entry
    // out of the pending count and out of the drain loop for the length of
    // the round trip, and it is why nothing here has to correct a status or
    // schedule a follow-up afterwards (#446 review).
    //
    // Best effort, deliberately. A device that cannot write IndexedDB
    // (quota, most likely on the blob-carrying kinds) must keep making
    // online writes exactly as it did before. Rejecting every online write
    // on a full disk is a certain outage traded for a possible crash — the
    // wrong way round. Without the entry the attempt is what it always was.
    const queued = await bestEffort('persist-before-attempt', () => putEntry(entry));
    try {
      await runHandler(entry);
    } catch (err) {
      if (err instanceof UnretryableOutboxError) {
        // The mutation rejects and React Query rolls the patch back, so
        // the entry must not stay behind. If the delete fails it stays
        // `attempting`, which is not counted and not drained, until a
        // lock-holding drain adopts and replays it — the same at-least-once
        // case as any other abandoned attempt.
        await bestEffort('delete-after-permanent-failure', () => deleteEntry(entry.id));
        throw err;
      }
      // Transient — join the queue. We intentionally use the same entry
      // (with attemptCount = 1 to reflect the just-failed attempt) so the
      // drain loop respects the retry ceiling.
      const attempted: OutboxEntry = {
        ...entry,
        status: 'pending',
        attemptCount: 1,
        lastError: err instanceof Error ? err.message : 'unknown error',
      };
      // Which of the two this put is depends on whether the pre-attempt one
      // landed (#446 review). With the entry already queued this only
      // records the burnt attempt, so a failure must not fail the write —
      // the drain replays it either way. Without it, this put *is* the
      // queue entry, and swallowing a failure would resolve the mutation as
      // "queued" while the write vanished: the silent loss #445 is about.
      if (queued) {
        await bestEffort('record-transient-attempt', () => putEntry(attempted));
      } else {
        await putEntry(attempted);
      }
      return 'queued-transient';
    }
    // Outside the try: a failed delete is not a failed handler. Inside, an
    // IDB error after a landed write took the transient branch, which
    // replayed a write the server had accepted and put the IndexedDB error
    // text in the entry's lastError (#446 review). A failure here leaves the
    // entry `attempting`, which shows in no count and blocks no drain until
    // one adopts and replays it.
    await bestEffort('delete-after-landing', () => deleteEntry(entry.id));
    return 'landed';
  };

  const outcome = await withCrossTabLock(run);
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
  // A landed write needs no follow-up. Its entry was `attempting` throughout,
  // so no count ever named it and there is nothing to correct.
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
