import { captureException } from '@/lib/platform/telemetry';

import { bestEffort } from './best-effort';
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
 * Sized against the retry schedule (#391): with a 2 s base doubling to a 30 s
 * cap, the sixth attempt lands ~60 s after the first, so a blip cannot exhaust
 * the budget but a real outage still surfaces as `failed` within a minute.
 * Change this only together with the delays in `drain-state.ts`.
 */
const MAX_ATTEMPTS_BEFORE_FAILED = 6;

/** Drains in a row that achieved nothing before the retry timer stops (#458). */
const MAX_STALLED_DRAINS = 6;

export type { OutboxStatus };
export { __resetDrainForTests } from './drain-state';

type StatusCounts = Pick<OutboxStatus, 'pendingCount' | 'failedCount' | 'conflictCount'>;

const emit = async (): Promise<void> => {
  let counts: StatusCounts | undefined;
  // `drain` awaits this outside its try, with `draining` already set, so a
  // throw here left the flag set and the tab never drained again (#458).
  await bestEffort('emit-list-entries', async () => {
    const entries = await listEntries();
    const failed = entries.filter((e) => e.status === 'failed');
    counts = {
      pendingCount: entries.filter((e) => e.status === 'pending').length,
      failedCount: failed.length,
      conflictCount: failed.filter((e) => e.failureKind === 'conflict').length,
    };
  });
  const next: OutboxStatus = {
    // A read that failed keeps its last counts rather than reporting zero,
    // which would clear the pill for writes that are still queued (#458).
    ...drainState.lastStatus,
    ...(counts ?? {}),
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    draining: drainState.draining,
    timerDrain: drainState.timerDrain,
  };
  drainState.lastStatus = next;
  drainSubscribers.forEach((fn) => fn(next));
};

/** For `discardEntry`, which does no draining and so must push counts (#290). */
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
 * A landed updateBoard stales the guard on every queued entry for the same
 * board (#281), `done` itself included when its delete failed (#449). The board
 * clock covers this tab; persisting the baseline covers the tab that picks the
 * queue up later with an empty clock.
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
 * Drop entries belonging to another account (#446) and adopt attempts whose
 * page went away (#445), then return what is left so the caller pays no second
 * `listEntries`. MUST run inside the cross-tab lock: that is what makes an
 * `attempting` entry provably ownerless. See docs/outbox.md for the argument.
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

type RunOutcome = 'ok' | 'ok-uncleared' | 'transient' | 'failed';

const runOne = async (entry: OutboxEntry): Promise<RunOutcome> => {
  try {
    await runHandler(entry);
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
  // Outside the try: a failed delete is not a failed handler. Inside, it took
  // the transient branch and replayed a write the server had accepted (#449).
  const cleared = await bestEffort('drain-delete-after-landing', () => deleteEntry(entry.id));
  await bestEffort('drain-forward-board-guards', () => forwardBoardGuards(entry));
  // An uncleared entry re-lands every pass. Reported apart from `ok` so it
  // cannot pass for queue progress and hold the backoff at its base (#449).
  return cleared ? 'ok' : 'ok-uncleared';
};

/**
 * `drainState.draining` is per-tab but the queue is shared, so two windows can
 * drain the same entries (#278). Exclusive and non-reentrant: never take the
 * lock from inside the callback. Without `navigator.locks` this runs unlocked
 * and the idempotent handlers carry the double-replay risk.
 */
export const withCrossTabLock = async <T>(fn: () => Promise<T>): Promise<T> => {
  if (typeof navigator !== 'undefined' && 'locks' in navigator) {
    return (await navigator.locks.request('talrum-outbox', fn)) as T;
  }
  return fn();
};

const clearRetryTimer = (): void => {
  clearTimeout(drainState.retryTimer);
  drainState.retryTimer = undefined;
};

/**
 * Without this, an entry that fails while the device stays online waits for
 * the next external trigger, and the pending count sticks (#391).
 */
const scheduleRetry = (): void => {
  clearRetryTimer();
  drainState.retryTimer = setTimeout(() => {
    drainState.retryTimer = undefined;
    void drain({ fromTimer: true });
  }, drainState.retryDelayMs);
  drainState.retryDelayMs = Math.min(drainState.retryDelayMs * 2, RETRY_MAX_DELAY_MS);
};

const cancelRetryOnOffline = (): void => {
  clearRetryTimer();
  // A network that came back is as strong a signal of a changed device as the
  // Retry button, and these entries are `pending`, so no button reaches them.
  resetRetrySchedule();
};

/**
 * A Retry needs a fresh backoff as well as a fresh attempt budget: after a long
 * outage the delay sits at the cap, and silence right after a button press is
 * worst. The give-up count is the other half of the schedule, so it goes too.
 */
export const resetRetrySchedule = (): void => {
  drainState.retryDelayMs = RETRY_BASE_DELAY_MS;
  drainState.stalledDrains = 0;
};

/**
 * Drains pending entries in FIFO order, stopping at the first transient failure
 * to preserve ordering. Permanent failures are marked and skipped so one bad
 * entry cannot dam the queue. `fromTimer` reaches the status as `timerDrain`,
 * which keeps the indicator's live-region label steady across a backoff (#409).
 */
export const drain = async ({ fromTimer = false } = {}): Promise<void> => {
  if (drainState.draining) {
    drainState.pendingDrain = true;
    return;
  }
  // `startOutbox` drains at module load, before AuthGate resolves the session.
  // Without this gate the first drain after every reload replays the previous
  // account's leftovers before the owner is known (#446). `setOutboxOwner`
  // runs the drain skipped here.
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
  let sawUncleared = false;
  let passThrew = false;
  try {
    await withCrossTabLock(async () => {
      // The pre-drain check goes stale while another tab holds the lock, and
      // attempting on a dropped network burns the retry budget for nothing.
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      let queue = await reconcileQueue();
      let stop = false;
      while (!stop) {
        const entries = queue.filter((e) => e.status === 'pending');
        if (entries.length === 0) break;
        for (const entry of entries) {
          const outcome = await runOne(entry);
          if (outcome === 'ok') sawProgress = true;
          // An uncleared entry is still queued for replay, so anything behind
          // it must wait: landing the newer write first lets the replay put the
          // older one back on top of it (#449).
          if (outcome === 'ok-uncleared') {
            sawUncleared = true;
            stop = true;
            break;
          }
          if (outcome === 'transient') {
            sawTransient = true;
            stop = true;
            break;
          }
        }
        // Re-read: this pass deleted what it landed, and an enqueue may have
        // appended behind it.
        queue = await listEntries();
      }
    });
  } catch (err) {
    // `enqueueAndDrain` awaits a drain for a write it has already persisted,
    // and a rejection rolls that patch back (#458). `sawTransient`, not
    // `bestEffort`: the failure decides the retry, so it changes something.
    captureException(err, { level: 'warning', tags: { component: 'outbox', op: 'drain-pass' } });
    sawTransient = true;
    passThrew = true;
  } finally {
    // Decide the retry while `draining` is still true, or a fresh drain can
    // start during the emit() await and get a stray timer armed under it.
    // Progress resets the backoff: a queue that lands entries each pass is not
    // the sustained-failure case the doubling exists for (#391).
    if (!sawUncleared && (sawProgress || !sawTransient)) {
      drainState.retryDelayMs = RETRY_BASE_DELAY_MS;
    }
    // A timer set after the device dropped would wake once, hit the offline
    // branch, and cancel itself. The `online` event is the next trigger.
    const online = typeof navigator === 'undefined' || navigator.onLine;
    // An uncleared entry needs the timer too: nothing else clears a landed
    // write the delete left `pending`, and the delete usually works next
    // time — the IDB connection another tab closed reopens on reuse (#449).

    // A drain that IndexedDB stopped from running the queue may never heal, so
    // the timer would wake for the rest of an idle session. `online` stays a
    // trigger; Retry does not, because it needs a `failed` entry.
    const stalled = passThrew && !sawProgress && !sawUncleared;
    drainState.stalledDrains = stalled ? drainState.stalledDrains + 1 : 0;
    const giveUp = drainState.stalledDrains >= MAX_STALLED_DRAINS;
    if ((sawTransient || sawUncleared) && !drainState.pendingDrain && online && !giveUp) {
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

/** Idempotent — call once at app boot. */
export const startOutbox = (): void => {
  if (drainState.listenersAttached) return;
  drainState.listenersAttached = true;
  // Prime lastStatus, or a cold boot with persisted entries renders "synced"
  // and snaps to "3 pending" once the first drain completes (#29).
  void emit();
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      void drain();
    });
    window.addEventListener('offline', () => {
      // No point waiting out a backoff on a dead network (#391).
      cancelRetryOnOffline();
      void emit();
    });
  }
  void drain();
};
