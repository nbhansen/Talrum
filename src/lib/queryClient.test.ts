import type { Query } from '@tanstack/react-query';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import { persistQueryClientRestore } from '@tanstack/react-query-persist-client';
import { del, get, keys, set } from 'idb-keyval';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  // jsdom has no Cache Storage; stub the two methods the scrub uses.
  const stubCaches = (names: string[]): Set<string> => {
    const live = new Set(names);
    vi.stubGlobal('caches', {
      keys: () => Promise.resolve([...live]),
      delete: (name: string) => Promise.resolve(live.delete(name)),
    });
    return live;
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The outbox sweep is the only thing between a shared device and user A's
  // writes, blobs included. Unlocked it is a `keys()` snapshot then deletes,
  // and the fast path holds the cross-tab lock while it persists an entry and
  // runs its handler — so a write landing after the snapshot would outlive
  // sign-out and be replayed under user B (#446 review).
  it('sweeps the outbox stripes under the outbox cross-tab lock', async () => {
    stubCaches([]);
    const lockNames: string[] = [];
    let outboxKeysBeforeRelease: IDBValidKey[] = ['not-read'];
    // jsdom has no Web Locks, so withCrossTabLock would run unlocked.
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: async (name: string, fn: () => Promise<unknown>) => {
          lockNames.push(name);
          const result = await fn();
          outboxKeysBeforeRelease = (await keys()).filter(
            (k) => typeof k === 'string' && k.startsWith('outbox:'),
          );
          return result;
        },
      },
    });
    await set('outbox:01ARZ', { id: '01ARZ', kind: 'renamePicto' });

    await clearPersistedCache();

    Reflect.deleteProperty(navigator, 'locks');
    expect(lockNames).toEqual(['talrum-outbox']);
    // Already gone before the lock was released, so a fast path waiting on it
    // could not have landed an entry behind the sweep's snapshot.
    expect(outboxKeysBeforeRelease).toEqual([]);
  });

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

  it('deletes the SW storage cache by prefix but leaves the app-shell precache alone (#380)', async () => {
    const live = stubCaches([
      'talrum-storage-v1',
      // A hypothetical future bump that a literal-name delete would orphan.
      'talrum-storage-v2',
      // The precache is not per-user; deleting it would strip offline mode
      // from the app shell for the next user.
      'workbox-precache-v2-https://talrum.pages.dev/',
    ]);

    await clearPersistedCache();

    expect([...live]).toEqual(['workbox-precache-v2-https://talrum.pages.dev/']);
  });

  it("drops Workbox's expiration index — its rows hold the user's signed URLs (#380)", async () => {
    // Mimic what ExpirationPlugin leaves behind: an IDB database whose rows
    // embed full signed storage URLs. The connection must close, or the
    // scrub's deleteDatabase would wait on it.
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('workbox-expiration', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('cache-entries', { keyPath: 'id' });
      };
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => {
        reject(req.error);
      };
    });
    stubCaches([]);

    await clearPersistedCache();

    const names = (await indexedDB.databases()).map((d) => d.name);
    expect(names).not.toContain('workbox-expiration');
  });

  // Also covers the no-Cache-Storage path: no stub is installed here, so
  // `caches` is undefined, as in jsdom and non-secure browsing contexts.
  it('is idempotent on an already-clean device', async () => {
    await expect(clearPersistedCache()).resolves.toBeUndefined();
    await expect(clearPersistedCache()).resolves.toBeUndefined();
  });
});
