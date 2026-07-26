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
 *
 * Synchronous from the caller's POV for the localStorage clears; the IDB
 * deletes race with the next sign-in's hydration but every operation is
 * idempotent.
 */
export const clearPersistedCache = async (): Promise<void> => {
  queryClient.clear();
  clearPin();
  clearLastBoard();
  // persister and the outbox/signed-url sweep touch disjoint IDB entries,
  // so the round trips parallelize cleanly.
  await Promise.all([
    persister.removeClient(),
    keys().then((all) => {
      const stripeKeys = all.filter(
        (k): k is string =>
          typeof k === 'string' && (k.startsWith('outbox:') || k.startsWith('signed-url:')),
      );
      return Promise.all(stripeKeys.map((k) => del(k)));
    }),
  ]);
};
