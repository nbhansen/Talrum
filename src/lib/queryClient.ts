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
 * Pinned to package.json `version` (Vite-replaced at build). Bumping the
 * version invalidates the persisted cache — the right call when domain types
 * change.
 */
export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: ONE_WEEK_MS,
  buster: __APP_VERSION__,
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
