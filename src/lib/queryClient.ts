import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { del, get, keys, set } from 'idb-keyval';

import { clearLastBoard } from './lastBoard';
import { clearPin } from './pin';

/**
 * AAC use is calm, not real-time. Skip focus-refetching so an iPad tap away
 * doesn't churn; keep data fresh for 30s so a mutation + immediate re-read
 * hits cache.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const persister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => get<string>(key).then((v) => v ?? null),
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
  key: 'talrum-react-query',
  // Async string IO over IndexedDB; throttle to coalesce rapid mutations.
  throttleTime: 1_000,
});

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * `buster` is the build's commit sha, so every deploy discards what the device
 * persisted. Over-invalidating costs one refetch on a device that is online by
 * definition; the opposite error hydrates a stale cache into new code and is
 * silent (#356). CI fails the build if the sha falls back to `'dev'`.
 */
export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: ONE_WEEK_MS,
  buster: __APP_COMMIT__,
  dehydrateOptions: {
    // A dehydrated pending query replays as `success` with `undefined` data.
    shouldDehydrateQuery: (q) => q.state.status === 'success' && q.state.data !== undefined,
  },
};

/**
 * Drop every per-user store at an auth boundary so the next user of a shared
 * device starts clean: the query cache, the outbox, signed URLs, the PIN and
 * last-board pointer (#178), and the service worker's byte cache (#380).
 * The IDB deletes race the next sign-in's hydration, but all are idempotent.
 */
export const clearPersistedCache = async (): Promise<void> => {
  queryClient.clear();
  clearPin();
  clearLastBoard();
  // Disjoint stores, so the round trips parallelize cleanly.
  await Promise.all([
    persister.removeClient(),
    // Deliberately not under the outbox cross-tab lock (#446). `enqueuedBy` is
    // what makes the guarantee hold, and the lock is held across handler IO —
    // taking it would leave user A's blobs on the device for a whole upload.
    keys().then((all) => {
      const stripeKeys = all.filter(
        (k): k is string =>
          typeof k === 'string' && (k.startsWith('outbox:') || k.startsWith('signed-url:')),
      );
      return Promise.all(stripeKeys.map((k) => del(k)));
    }),
    clearStorageCaches(),
  ]);
};

/**
 * By prefix, not the literal name in vite.config.ts: `cleanupOutdatedCaches`
 * covers only the precache, so a `-v2` bump would orphan the old runtime cache.
 * The prefix must never match `workbox-precache-*`, which is not per-user.
 */
const clearStorageCaches = async (): Promise<void> => {
  // Absent in jsdom and non-secure contexts.
  if (typeof caches === 'undefined') return;
  const names = await caches.keys();
  await Promise.all(
    names.filter((n) => n.startsWith('talrum-storage')).map((n) => caches.delete(n)),
  );
  // The ExpirationPlugin index holds one row per cached entry, each with a
  // full signed URL — the same per-user residue, one store over. It can settle
  // late (the SW holds a connection); every cache hit re-stamps its row, so a
  // delete that takes the next user's fresh rows self-heals.
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('workbox-expiration');
    req.onsuccess = () => {
      resolve();
    };
    req.onerror = () => {
      reject(req.error ?? new Error('workbox-expiration delete failed'));
    };
  });
};
