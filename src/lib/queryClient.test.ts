import type { Query } from '@tanstack/react-query';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import { persistQueryClientRestore } from '@tanstack/react-query-persist-client';
import { del, get, keys, set } from 'idb-keyval';
import { afterEach, describe, expect, it } from 'vitest';

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

describe('persistOptions.buster (#356)', () => {
  const dehydrated = (buster: string): PersistedClient => ({
    buster,
    timestamp: Date.now(),
    clientState: {
      mutations: [],
      queries: [
        {
          queryKey: ['boards'],
          queryHash: '["boards"]',
          state: { status: 'success', data: [{ id: 'b1' }], dataUpdatedAt: Date.now() },
        } as unknown as PersistedClient['clientState']['queries'][number],
      ],
    },
  });

  // Written straight to the persister's key rather than through
  // `persistClient`, which is wrapped in the 1s `throttleTime` and can resolve
  // before the IndexedDB write lands — the restore below would then race it.
  const persistDirectly = (client: PersistedClient): Promise<void> =>
    set('talrum-react-query', JSON.stringify(client));

  const restore = (): Promise<void> =>
    persistQueryClientRestore({ queryClient, ...persistOptions });

  afterEach(async () => {
    queryClient.clear();
    await del('talrum-react-query');
  });

  // The bug: this was __APP_VERSION__, i.e. package.json's version, which a
  // continuously-deployed repo never bumps. Assert the value changes per
  // build rather than asserting a literal, which would just restate it.
  it('is the build commit, not the package version', () => {
    expect(persistOptions.buster).toBe(__APP_COMMIT__);
    expect(persistOptions.buster).not.toBe(__APP_VERSION__);
  });

  it('discards a cache written by a different build', async () => {
    await persistDirectly(dehydrated('some-older-build'));

    await restore();

    expect(queryClient.getQueryData(['boards'])).toBeUndefined();
    expect(await get('talrum-react-query')).toBeUndefined();
  });

  it('restores a cache written by this build', async () => {
    await persistDirectly(dehydrated(__APP_COMMIT__));

    await restore();

    expect(queryClient.getQueryData(['boards'])).toEqual([{ id: 'b1' }]);
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
