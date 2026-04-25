import { useEffect, useState } from 'react';
import { ulid } from 'ulid';

import { drain, getStatus, kick, type OutboxStatus, startOutbox, subscribeStatus } from './drain';
import { runHandler, UnretryableOutboxError } from './handlers';
import { deleteEntry, listEntries, putEntry } from './store';
import type { OutboxEntry } from './types';

export type { BoardRowPatch, OutboxEntry, OutboxEntryStatus } from './types';
export { kick, startOutbox, UnretryableOutboxError };

type EntryInput = Omit<OutboxEntry, 'id' | 'enqueuedAt' | 'attemptCount' | 'status'>;

/**
 * The hot path for every mutation. Online: try the handler immediately; on
 * success the optimistic patch in the cache becomes durable with no IDB
 * detour. On a network failure, persist the entry and let the drain loop
 * retry. On a permanent failure (RLS, validation), reject so React Query's
 * onError rolls the optimistic patch back.
 *
 * Offline: skip the immediate attempt — persist the entry and resolve. The
 * UI keeps the optimistic state; the drain loop replays when `online` fires.
 */
export const enqueueAndDrain = async (input: EntryInput): Promise<void> => {
  const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
  if (isOnline) {
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
};

/** Drop a single failed entry from the queue (the indicator's "Discard"). */
export const discardEntry = async (id: string): Promise<void> => {
  await deleteEntry(id);
};

/** Inspect the queue (e.g. to render a per-entry error list). */
export const peekEntries = listEntries;

export const useOutboxStatus = (): OutboxStatus => {
  const [status, setStatus] = useState<OutboxStatus>(getStatus());
  useEffect(() => subscribeStatus(setStatus), []);
  return status;
};
