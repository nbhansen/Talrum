import type { Query } from '@tanstack/react-query';
import { get, keys, set } from 'idb-keyval';
import { describe, expect, it } from 'vitest';

import { getLastBoard, setLastBoard } from './lastBoard';
import { hasPin, setPin } from './pin';
import { clearPersistedCache, persistOptions, queryClient } from './queryClient';

const fakeQuery = (status: 'success' | 'pending' | 'error', data: unknown): Query =>
  ({ state: { status, data } }) as unknown as Query;

describe('queryClient defaults', () => {
  it('pins the calm-not-realtime query behavior', () => {
    const queries = queryClient.getDefaultOptions().queries;
    expect(queries?.staleTime).toBe(30_000);
    expect(queries?.refetchOnWindowFocus).toBe(false);
    expect(queries?.retry).toBe(1);
  });
});

describe('persistOptions.shouldDehydrateQuery', () => {
  const shouldDehydrate = persistOptions.dehydrateOptions?.shouldDehydrateQuery;
  if (!shouldDehydrate) throw new Error('shouldDehydrateQuery not configured');

  it('persists successful queries with data', () => {
    expect(shouldDehydrate(fakeQuery('success', [{ id: 'b1' }]))).toBe(true);
  });

  it('never persists pending queries — they would replay as success/undefined on boot', () => {
    expect(shouldDehydrate(fakeQuery('pending', undefined))).toBe(false);
  });

  it('never persists errored queries', () => {
    expect(shouldDehydrate(fakeQuery('error', undefined))).toBe(false);
  });

  it('never persists success-with-undefined-data', () => {
    expect(shouldDehydrate(fakeQuery('success', undefined))).toBe(false);
  });
});

describe('clearPersistedCache', () => {
  it('wipes cache, PIN, last-board, and the per-user IDB stripes but leaves foreign keys alone', async () => {
    // Simulate user A's device state.
    queryClient.setQueryData(['boards'], [{ id: 'b1' }]);
    await setPin('1234');
    setLastBoard({ id: 'b1', kind: 'sequence' });
    await set('outbox:01ARZ', { id: '01ARZ', kind: 'renamePicto' });
    await set('signed-url:pictogram-images/o/p.jpg', { url: 'https://x', expiresAt: 1 });
    await set('talrum-react-query', '{"clientState":{}}');
    // An IDB entry the sweep must NOT touch (nothing else owns this key).
    await set('some-other-feature', 'keep-me');

    await clearPersistedCache();

    expect(queryClient.getQueryData(['boards'])).toBeUndefined();
    expect(hasPin()).toBe(false);
    expect(getLastBoard()).toBeNull();
    const remaining = await keys();
    expect(remaining.filter((k) => typeof k === 'string' && k.startsWith('outbox:'))).toEqual([]);
    expect(remaining.filter((k) => typeof k === 'string' && k.startsWith('signed-url:'))).toEqual(
      [],
    );
    expect(remaining).not.toContain('talrum-react-query');
    expect(await get('some-other-feature')).toBe('keep-me');
  });

  it('is idempotent on an already-clean device', async () => {
    await expect(clearPersistedCache()).resolves.toBeUndefined();
    await expect(clearPersistedCache()).resolves.toBeUndefined();
  });
});
