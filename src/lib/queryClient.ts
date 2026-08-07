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
 * Pinned to the build's commit sha, so every deploy discards whatever the
 * device had persisted.
 *
 * It used to be `__APP_VERSION__`, i.e. package.json's version — which this
 * repo never bumps, because it deploys continuously from main. So the escape
 * hatch for domain-type changes was a constant, and could not fire (#356). A
 * week-old cache (`maxAge`) would hydrate into new code and be treated as a
 * successful query result, because `shouldDehydrateQuery` only ever persisted
 * successes: a renamed field reads `undefined` and the screen renders wrong or
 * crashes, with no reload that clears it.
 *
 * Invalidating on every deploy over-invalidates on purpose. The cost is one
 * refetch, paid while the device is necessarily online — a client only sees a
 * new buster by having just downloaded the build that carries it — and the
 * cache is re-persisted within the second. The opposite error is silent and
 * unrecoverable by the user, so the asymmetry decides it.
 *
 * This only holds while the value really changes per build. `vite.config.ts`
 * reads it from git and falls back to the constant `'dev'`, which would be
 * this same bug in a different costume, so that fallback fails the build in CI.
 */
export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: ONE_WEEK_MS,
  buster: __APP_COMMIT__,
  dehydrateOptions: {
    // Skip queries that are still pending / errored / disabled. Dehydrating a
    // pending query would replay it as `success` with `undefined` data on the
    // next boot.
    shouldDehydrateQuery: (q) => q.state.status === 'success' && q.state.data !== undefined,
  },
};

/**
 * Drop ALL per-user persisted state at an auth boundary (sign-out, or a
 * same-tab switch to a different user.id) so the next user starts clean.
 * Called by AuthGate's onAuthStateChange handler. Wipes:
 *   - The React Query cache (in-memory + persisted under the persister key).
 *   - Every queued outbox entry — without this, mutations queued offline by
 *     user A would replay against user B's session on next sign-in. RLS
 *     blocks them at the server, but the indicator would surface them as
 *     "N failed", which is both confusing and a small information leak
 *     about user A's prior intent.
 *   - Persisted signed-URL entries — same logic, those reference user A's
 *     storage paths.
 *   - The parent PIN hash (#178) — otherwise user B is locked out of kid
 *     mode by user A's PIN on a shared device.
 *   - The last-board pointer (#178) — otherwise user B's auto-launch lands
 *     on user A's board UUID, which 404s under RLS.
 *   - The service worker's storage cache (#380) — user A's photo and
 *     recording bytes, keyed by signed URL. Not addressable without the
 *     wiped path and token stripes, so this is defence in depth — but bytes
 *     on a shared device should not outlive the account that put them there.
 *
 * Synchronous from the caller's POV for the localStorage clears; the IDB
 * deletes race with the next sign-in's hydration but every operation is
 * idempotent.
 */
export const clearPersistedCache = async (): Promise<void> => {
  queryClient.clear();
  clearPin();
  clearLastBoard();
  // persister, the outbox/signed-url sweep, and Cache Storage are disjoint
  // stores, so the round trips parallelize cleanly.
  await Promise.all([
    persister.removeClient(),
    // Deliberately not under the outbox's cross-tab lock (#446 review). The
    // lock would only stop a write landing *between* this `keys()` snapshot
    // and its deletes — it cannot stop an enqueue that is already waiting on
    // it, which acquires it after this releases and writes behind the
    // deletes. So the sweep was never the thing that makes the guarantee
    // hold; `enqueuedBy` plus `reconcileQueue` is, and that does not care
    // when the entry was written. Taking the lock would buy the weaker half
    // of the property and cost the stronger one: the lock is held across
    // handler IO, so a sign-out during a photo upload would leave user A's
    // blobs on a shared device for the whole upload rather than wiping them
    // now.
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
 * Delete the service worker's Supabase Storage cache(s). By prefix rather
 * than the literal name in vite.config.ts (`talrum-storage-v1`): a future
 * `-v2` bump then cannot silently orphan the old cache, because Workbox's
 * `cleanupOutdatedCaches` covers only the precache, not runtime caches. The
 * prefix must never match `workbox-precache-*` — the app-shell precache is
 * not per-user, and deleting it would strip offline mode for the next user.
 */
const clearStorageCaches = async (): Promise<void> => {
  // Absent in jsdom and in non-secure contexts; nothing to wipe there.
  if (typeof caches === 'undefined') return;
  const names = await caches.keys();
  await Promise.all(
    names.filter((n) => n.startsWith('talrum-storage')).map((n) => caches.delete(n)),
  );
  // Deleting the caches leaves Workbox's ExpirationPlugin index behind: one
  // row per cached entry in the `workbox-expiration` IDB database, holding
  // the full signed URL — the same per-user residue, one store over. Only
  // the storage caches deleted above use that database, so drop it whole.
  // The delete can wait: the SW holds an open connection and Workbox passes
  // no `blocking` handler, so the request settles only when the browser
  // stops the idle SW. Fine — AuthGate does not await this, the rows are
  // unaddressable meanwhile, and a late delete that takes the next user's
  // fresh rows self-heals because every cache hit re-stamps its row.
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
