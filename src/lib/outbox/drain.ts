import { runHandler, UnretryableOutboxError } from './handlers';
import { deleteEntry, listEntries, putEntry } from './store';
import type { OutboxEntry } from './types';

const MAX_ATTEMPTS_BEFORE_FAILED = 3;

let draining = false;
let pendingDrain = false;

export interface OutboxStatus {
  online: boolean;
  pendingCount: number;
  failedCount: number;
  draining: boolean;
}

const subscribers = new Set<(s: OutboxStatus) => void>();
let lastStatus: OutboxStatus = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  pendingCount: 0,
  failedCount: 0,
  draining: false,
};

const emit = async (): Promise<void> => {
  const entries = await listEntries();
  const next: OutboxStatus = {
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    pendingCount: entries.filter((e) => e.status === 'pending').length,
    failedCount: entries.filter((e) => e.status === 'failed').length,
    draining,
  };
  lastStatus = next;
  subscribers.forEach((fn) => fn(next));
};

export const subscribeStatus = (fn: (s: OutboxStatus) => void): (() => void) => {
  subscribers.add(fn);
  fn(lastStatus);
  return () => {
    subscribers.delete(fn);
  };
};

export const getStatus = (): OutboxStatus => lastStatus;

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
  if (draining) {
    pendingDrain = true;
    return;
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await emit();
    return;
  }
  draining = true;
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
    draining = false;
    await emit();
    if (pendingDrain) {
      pendingDrain = false;
      void drain();
    }
  }
};

let listenersAttached = false;
/** Wires `online` events + does an initial drain. Idempotent — call once at app boot. */
export const startOutbox = (): void => {
  if (listenersAttached) return;
  listenersAttached = true;
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
