import { resolveExpectedUpdatedAt } from './board-clock';
import {
  drainState,
  drainSubscribers,
  type OutboxStatus,
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_DELAY_MS,
} from './drain-state';
import { runHandler, UnretryableOutboxError } from './handlers';
import { getOutboxOwner } from './owner';
import { deleteEntry, getEntry, listEntries, putEntry } from './store';
import type { OutboxEntry } from './types';

/**
 * Sized against the retry schedule (#391): a 2 s base doubling to a 30 s cap
 * puts the queue head's sixth attempt ~60 s after its first, so a short
 * network blip cannot exhaust the budget while a real outage still surfaces
 * as `failed` within about a minute. Change either number only together
 * with the other. The derivation assumes a quiescent single tab: any other
 * trigger (an enqueue with a backlog, `online`, another tab's drain) also
 * burns a head attempt and spends the budget faster — as every trigger did
 * before the timer existed, on half the budget. Entries behind a failed
 * head start from the walked-up delay and take longer — the network is
 * known-bad by then. Retry recovers a `failed` entry either way.
 *
 * The ~60 s figure assumes attempts that fail fast (an immediate TypeError).
 * A hung request now costs up to its handler timeout per attempt (#413), so
 * a fully hung head reaches `failed` after budget × bound plus backoff —
 * minutes, not one — which is the intended shape: hangs are the slow,
 * rare case, and before #413 they never resolved at all.
 */
const MAX_ATTEMPTS_BEFORE_FAILED = 6;

export type { OutboxStatus };
export { __resetDrainForTests } from './drain-state';

const emit = async (): Promise<void> => {
  const entries = await listEntries();
  const failed = entries.filter((e) => e.status === 'failed');
  const next: OutboxStatus = {
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    pendingCount: entries.filter((e) => e.status === 'pending').length,
    failedCount: failed.length,
    conflictCount: failed.filter((e) => e.failureKind === 'conflict').length,
    draining: drainState.draining,
    timerDrain: drainState.timerDrain,
  };
  drainState.lastStatus = next;
  drainSubscribers.forEach((fn) => fn(next));
};

/**
 * Recompute status from the current IDB state and notify subscribers. Sole
 * caller is `discardEntry` — a discard does no draining (drain() is what
 * normally emits), so it must push the updated counts itself or the
 * OfflineIndicator waits for the next unrelated outbox event.
 */
export const refreshStatus = (): Promise<void> => emit();

export const subscribeStatus = (fn: (s: OutboxStatus) => void): (() => void) => {
  drainSubscribers.add(fn);
  fn(drainState.lastStatus);
  return () => {
    drainSubscribers.delete(fn);
  };
};

export const getStatus = (): OutboxStatus => drainState.lastStatus;

/**
 * A landed updateBoard bumps the server's `updated_at`, staling the guard on
 * every queued entry for the same board (#281). The handler's board clock
 * already covers this tab; persisting the resolved baseline into IDB covers
 * the tab that picks the queue up later with an empty clock. Only refreshes
 * existing guards — unguarded entries (pre-#281, stripped by Retry) must stay
 * unguarded. Runs inside the drain's cross-tab lock, like every queue rewrite.
 */
const forwardBoardGuards = async (done: OutboxEntry): Promise<void> => {
  if (done.kind !== 'updateBoard') return;
  for (const e of await listEntries()) {
    if (e.kind !== 'updateBoard' || e.boardId !== done.boardId) continue;
    if (e.status !== 'pending' || e.expectedUpdatedAt === undefined) continue;
    const resolved = resolveExpectedUpdatedAt(e.boardId, e.expectedUpdatedAt);
    if (resolved !== undefined && resolved !== e.expectedUpdatedAt) {
      await putEntry({ ...e, expectedUpdatedAt: resolved });
    }
  }
};

/**
 * Make the queue safe for this session to act on, and return what is left.
 *
 * MUST be called from inside the cross-tab lock. Two jobs:
 *
 * 1. **Drop foreign entries.** An entry belongs to the account that enqueued
 *    it, and on a shared device must never run on behalf of another. The
 *    sign-out sweep (`queryClient.ts`) deletes the queue at the auth
 *    boundary, but cannot be the whole guarantee: a fast path waiting on the
 *    lock acquires it *after* the sweep releases and writes its entry behind
 *    the deletes (#446 review). Here the owner is checked instead of the
 *    timing, so the ordering stops mattering. An entry with no `enqueuedBy`
 *    predates the stamp — unattributed, not foreign, so it is kept. With no
 *    current owner nothing is dropped, because there is nobody to compare
 *    against; `drain` does not run in that state at all, so the inert case
 *    never reaches a handler.
 *
 * 2. **Promote abandoned attempts.** Exact inside the lock rather than a
 *    heuristic: the fast path holds the lock for its whole attempt, and the
 *    browser releases a held lock when its tab dies. So an `attempting` entry
 *    visible to a lock holder cannot have a live owner — the owner would
 *    still be holding the lock. That covers the reload this exists for
 *    (#445), a crash, and another tab dying, with no timestamp and no
 *    timeout. The attempt is not counted: the entry may have landed
 *    server-side before the page went away, so the replay is the same
 *    at-least-once case handlers are already idempotent for.
 *
 * Returning the surviving queue means callers do not pay a second
 * `listEntries` — `keys()` plus a `get` per key — on the hot path for a scan
 * that finds nothing in the common case.
 *
 * Without `navigator.locks` the lock proof does not hold and
 * `withCrossTabLock` runs unlocked — the degradation that function
 * documents. The owner check does not depend on the lock and still holds.
 */
export const reconcileQueue = async (): Promise<OutboxEntry[]> => {
  const owner = getOutboxOwner();
  const kept: OutboxEntry[] = [];
  for (const e of await listEntries()) {
    if (owner !== null && e.enqueuedBy !== undefined && e.enqueuedBy !== owner) {
      await deleteEntry(e.id);
      continue;
    }
    if (e.status === 'attempting') {
      const promoted: OutboxEntry = { ...e, status: 'pending' };
      await putEntry(promoted);
      kept.push(promoted);
      continue;
    }
    kept.push(e);
  }
  return kept;
};

const runOne = async (entry: OutboxEntry): Promise<'ok' | 'transient' | 'failed'> => {
  try {
    await runHandler(entry);
    await deleteEntry(entry.id);
    await forwardBoardGuards(entry);
    return 'ok';
  } catch (err) {
    // Another tab's drain may have completed this entry and deleted it while
    // our attempt was in flight (our duplicate write then fails, e.g. on a
    // unique-key violation). Re-creating the entry as failed/pending would
    // resurrect a write that already succeeded (#278).
    const current = await getEntry(entry.id);
    if (current === undefined) return 'ok';
    // Rewrite from the fresh IDB copy, not the loop's snapshot: an earlier
    // entry in this same drain pass may have forwarded this entry's conflict
    // baseline (#281), and `entry` predates that.
    const attemptCount = current.attemptCount + 1;
    const message = err instanceof Error ? err.message : 'unknown error';
    if (err instanceof UnretryableOutboxError) {
      await putEntry({
        ...current,
        attemptCount,
        status: 'failed',
        lastError: message,
        failureKind: err.failureKind,
      });
      return 'failed';
    }
    if (attemptCount >= MAX_ATTEMPTS_BEFORE_FAILED) {
      await putEntry({
        ...current,
        attemptCount,
        status: 'failed',
        lastError: message,
        failureKind: 'permanent',
      });
      return 'failed';
    }
    await putEntry({ ...current, attemptCount, status: 'pending', lastError: message });
    return 'transient';
  }
};

/**
 * The `drainState.draining` guard above is per-tab, but the queue lives in
 * shared IndexedDB: a PWA window plus a browser tab can otherwise drain the
 * same entries concurrently (#278). Serialize cross-tab via the Web Locks API
 * (held locks are released automatically if the tab dies). jsdom and SSR have
 * no `navigator.locks`; fall back to running unlocked — the per-tab guard
 * still covers drains in the single-context case, but not the fast path:
 * `enqueueAndDrain` never sets `drainState.draining`, so a drain can start
 * mid-round-trip, list the entry the fast path persisted before attempting
 * (#445), and run its handler a second time. Handlers are idempotent for
 * exactly this class. Web Locks needs a secure context, so this is jsdom and
 * plain-HTTP origins only.
 *
 * Also wraps the queue rewrites in `retryFailed`/`discardEntry` (#289) and
 * the fast path in `enqueueAndDrain` (#395) — without it, two tabs can both
 * observe an empty queue and run handlers concurrently. The lock is exclusive
 * and non-reentrant: never call `drain()` (or anything else that takes the
 * lock) from inside the callback. Generic so the fast path can report its
 * outcome through the lock and act on it after the release.
 */
export const withCrossTabLock = async <T>(fn: () => Promise<T>): Promise<T> => {
  if (typeof navigator !== 'undefined' && 'locks' in navigator) {
    return (await navigator.locks.request('talrum-outbox', fn)) as T;
  }
  return fn();
};

/**
 * Cancel the scheduled re-drain (#391). Called when a drain actually starts
 * (it is about to do the timer's work), when the queue outcome no longer
 * needs one, and when the device goes offline (`online` will trigger the
 * next drain instead).
 */
const clearRetryTimer = (): void => {
  clearTimeout(drainState.retryTimer);
  drainState.retryTimer = undefined;
};

/**
 * Schedule an automatic re-drain after a transient failure (#391). Without
 * it, an entry that fails while the device stays online waits for the next
 * external trigger (online event, new enqueue, manual retry) — a stuck
 * pending count. Exponential backoff, capped; the delay resets once a pass
 * completes without a transient failure or the device goes offline.
 */
const scheduleRetry = (): void => {
  clearRetryTimer();
  drainState.retryTimer = setTimeout(() => {
    drainState.retryTimer = undefined;
    void drain({ fromTimer: true });
  }, drainState.retryDelayMs);
  drainState.retryDelayMs = Math.min(drainState.retryDelayMs * 2, RETRY_MAX_DELAY_MS);
};

/** Offline path for the timer: cancel it and start the backoff over. */
const cancelRetryOnOffline = (): void => {
  clearRetryTimer();
  drainState.retryDelayMs = RETRY_BASE_DELAY_MS;
};

/**
 * A user Retry means a fresh attempt budget *and* a fresh backoff — after a
 * long outage the delay sits at the cap, and 30 s of silence right after the
 * user pressed the button is the worst possible moment for it (#391 review).
 */
export const resetRetryDelay = (): void => {
  drainState.retryDelayMs = RETRY_BASE_DELAY_MS;
};

/**
 * Drains every pending entry in FIFO order. Stops at the first transient
 * failure to preserve ordering. Permanent failures (RLS, validation) are
 * marked and skipped so a single bad entry can't dam the queue.
 *
 * FIFO is per attempt *start*: a run abandoned by the handler timeout
 * (#413) can still have a request in flight while later entries proceed,
 * and that write can land last. Accepted — it is the same last-write-wins
 * class as a cross-device replay (docs/outbox.md, "Known limits"), and
 * boards stay safe via the conflict guard (#281).
 *
 * `fromTimer` marks a drain the retry timer started (#409): only
 * `scheduleRetry` passes it, and the status carries it as `timerDrain` so
 * the OfflineIndicator can keep its live-region label steady across the
 * backoff schedule. A coalesced follow-up (`pendingDrain`) is always
 * event-driven — something new triggered it.
 */
export const drain = async ({ fromTimer = false } = {}): Promise<void> => {
  if (drainState.draining) {
    drainState.pendingDrain = true;
    return;
  }
  // No signed-in account means no session to write with, and no way to tell
  // whose entries these are. `startOutbox` drains at module load, before
  // AuthGate has resolved the session, so this is the boot path every time —
  // and without the gate the first drain after every reload would replay a
  // previous account's leftovers before the owner is known (#446 review).
  // `setOutboxOwner` runs the drain this skips once the session resolves.
  if (getOutboxOwner() === null) {
    await emit();
    return;
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    cancelRetryOnOffline();
    await emit();
    return;
  }
  drainState.draining = true;
  drainState.timerDrain = fromTimer;
  clearRetryTimer();
  await emit();
  let sawTransient = false;
  let sawProgress = false;
  try {
    await withCrossTabLock(async () => {
      // The pre-drain online check can be seconds stale by the time another
      // tab releases the lock; attempting entries on a network that dropped
      // meanwhile burns their transient-retry budget on guaranteed failures.
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      // Inside the lock: drops entries this session does not own and adopts
      // abandoned attempts. Its return seeds the first pass, so neither costs
      // an extra round trip.
      let queue = await reconcileQueue();
      let stop = false;
      while (!stop) {
        const entries = queue.filter((e) => e.status === 'pending');
        if (entries.length === 0) break;
        for (const entry of entries) {
          const outcome = await runOne(entry);
          if (outcome === 'ok') sawProgress = true;
          if (outcome === 'transient') {
            sawTransient = true;
            stop = true;
            break;
          }
        }
        // Re-read for the next pass: this one deleted what it landed, and an
        // enqueue may have appended behind it.
        queue = await listEntries();
      }
    });
  } finally {
    // Decide the retry while `draining` is still true. Deciding after the
    // release opens a window (the emit() await) where a fresh drain can
    // start, clear an empty timer slot, and then get a stray timer armed
    // under it by this pass. A drain that starts after the release clears
    // the timer armed here — it is about to do the timer's work.
    // Progress resets the backoff: a queue that lands entries each pass is
    // not the sustained-failure case the doubling exists for (#391 review).
    if (sawProgress || !sawTransient) {
      drainState.retryDelayMs = RETRY_BASE_DELAY_MS;
    }
    // No timer when the device dropped mid-pass: it would only wake once,
    // hit the offline branch, and cancel itself. The `online` event is the
    // next trigger.
    const online = typeof navigator === 'undefined' || navigator.onLine;
    if (sawTransient && !drainState.pendingDrain && online) {
      scheduleRetry();
    }
    drainState.draining = false;
    drainState.timerDrain = false;
    await emit();
    if (drainState.pendingDrain) {
      // The immediate follow-up drain owns the retry decision.
      drainState.pendingDrain = false;
      void drain();
    }
  }
};

/** Wires `online` events + does an initial drain. Idempotent — call once at app boot. */
export const startOutbox = (): void => {
  if (drainState.listenersAttached) return;
  drainState.listenersAttached = true;
  // Prime lastStatus from IDB before any subscribe() call lands a stale zero
  // pendingCount on a cold boot with persisted entries (#29). emit() is async,
  // but we'd rather race a microtask than render a "synced" indicator that
  // snaps to "3 pending" once the first drain completes.
  void emit();
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      void drain();
    });
    window.addEventListener('offline', () => {
      // No point waiting out a backoff on a dead network — the `online`
      // event above is the next trigger (#391).
      cancelRetryOnOffline();
      void emit();
    });
  }
  void drain();
};
