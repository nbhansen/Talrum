import { del, get, keys, set } from 'idb-keyval';

import type { OutboxEntry } from './types';

/**
 * Each entry is stored under its own IDB key (`outbox:{ulid}`) so concurrent
 * enqueues don't race on a shared array. Iteration order = ULID order =
 * enqueue order, so FIFO is free.
 */
const PREFIX = 'outbox:';
const idbKey = (id: string): string => `${PREFIX}${id}`;
const isOutboxKey = (k: IDBValidKey): k is string =>
  typeof k === 'string' && k.startsWith(PREFIX);

export const putEntry = async (entry: OutboxEntry): Promise<void> => {
  await set(idbKey(entry.id), entry);
};

export const deleteEntry = async (id: string): Promise<void> => {
  await del(idbKey(id));
};

export const listEntries = async (): Promise<OutboxEntry[]> => {
  const allKeys = (await keys()).filter(isOutboxKey).sort();
  const entries = await Promise.all(allKeys.map((k) => get<OutboxEntry>(k)));
  return entries.filter((e): e is OutboxEntry => e !== undefined);
};
