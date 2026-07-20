import { get, set } from 'idb-keyval';
import { describe, expect, it } from 'vitest';

import { deleteEntry, getEntry, listEntries, putEntry } from './store';
import type { OutboxEntry, RenamePictogramEntry } from './types';

const entry = (id: string, label = 'Brush'): RenamePictogramEntry => ({
  id,
  enqueuedAt: 1,
  attemptCount: 0,
  status: 'pending',
  kind: 'renamePicto',
  pictogramId: 'p1',
  label,
});

describe('outbox store', () => {
  it('round-trips an entry through IDB under its own key', async () => {
    await putEntry(entry('01A'));

    expect(await getEntry('01A')).toEqual(entry('01A'));
    // One key per entry — concurrent enqueues must not race a shared array.
    expect(await get('outbox:01A')).toEqual(entry('01A'));
  });

  it('returns undefined for an unknown id', async () => {
    expect(await getEntry('nope')).toBeUndefined();
  });

  it('deletes an entry and leaves the rest', async () => {
    await putEntry(entry('01A'));
    await putEntry(entry('01B'));

    await deleteEntry('01A');

    expect(await getEntry('01A')).toBeUndefined();
    expect(await getEntry('01B')).toEqual(entry('01B'));
  });

  it('lists entries in ULID (enqueue) order regardless of write order', async () => {
    await putEntry(entry('01C'));
    await putEntry(entry('01A'));
    await putEntry(entry('01B'));

    const ids = (await listEntries()).map((e) => e.id);

    expect(ids).toEqual(['01A', '01B', '01C']);
  });

  it('ignores foreign IDB keys and entries that vanish mid-scan', async () => {
    await putEntry(entry('01A'));
    await set('signed-url:not-an-entry', { url: 'x' });
    // A key whose value is gone — the shape a delete racing keys()→get()
    // produces; listEntries must skip it, not return undefined holes.
    await set('outbox:01B', undefined);

    const entries = await listEntries();

    expect(entries).toEqual([entry('01A')]);
  });

  it('preserves the full entry payload, including failure bookkeeping', async () => {
    const failed: OutboxEntry = {
      ...entry('01F'),
      status: 'failed',
      attemptCount: 3,
      lastError: 'db 42501: row-level-security',
    };
    await putEntry(failed);

    expect(await getEntry('01F')).toEqual(failed);
  });
});
