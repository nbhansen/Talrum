import { drainState, drainSubscribers, type OutboxStatus } from './drain-state';
import { runHandler, UnretryableOutboxError } from './handlers';
import { deleteEntry, listEntries, putEntry } from './store';
import type { OutboxEntry } from './types';

const MAX_ATTEMPTS_BEFORE_FAILED = 3;

export type { OutboxStatus };
export { __resetDrainForTests } from './drain-state';

const emit = async (): Promise<void> => {
  const entries = await listEntries();
  const next: OutboxStatus = {
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    pendingCount: entries.filter((e) => e.status === 'pending').length,
    failedCount: entries.filter((e) => e.status === 'failed').length,
    draining: drainState.draining,
  };
  drainState.lastStatus = next;
  drainSubscribers.forEach((fn) => fn(next));
};

/**
 * Recompute status from the current IDB state and notify subscribers. Called
 * after `enqueueAndDrain` paths that don't go through `drain()` (offline
 * enqueue) so the OfflineIndicator updates immediately rather than waiting
 * for the next online/offline event.
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

const runOne = async (entry: OutboxEntry): Promise<'ok' | 'transient' | 'failed'> => {
  try {
    await runHandler(entry);
    await deleteEntry(entry.id);
    return 'ok';
  } catch (err) {
    const attemptCount = entry.attemptCount + 1;
    const message = err instanceof Error ? err.message : 'unknown error';
    if (err instanceof UnretryableOutboxError) {
      await putEntry({ ...entry, attemptCount, status: 'failed', lastError: message });
      return 'failed';
    }
    const status = attemptCount >= MAX_ATTEMPTS_BEFORE_FAILED ? 'failed' : 'pending';
    await putEntry({ ...entry, attemptCount, status, lastError: message });
    return status === 'failed' ? 'failed' : 'transient';
  }
};

/**
 * Drains every pending entry in FIFO order. Stops at the first transient
 * failure to preserve ordering. Permanent failures (RLS, validation) are
 * marked and skipped so a single bad entry can't dam the queue.
 */
export const drain = async (): Promise<void> => {
  if (drainState.draining) {
    drainState.pendingDrain = true;
    return;
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await emit();
    return;
  }
  drainState.draining = true;
  await emit();
  try {
    let stop = false;
    while (!stop) {
      const entries = (await listEntries()).filter((e) => e.status === 'pending');
      if (entries.length === 0) break;
      for (const entry of entries) {
        const outcome = await runOne(entry);
        if (outcome === 'transient') {
          stop = true;
          break;
        }
      }
    }
  } finally {
    drainState.draining = false;
    await emit();
    if (drainState.pendingDrain) {
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
      void emit();
    });
  }
  void drain();
};

export const kick = (): Promise<void> => drain();
