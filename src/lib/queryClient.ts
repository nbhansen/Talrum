import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { del, get, set } from 'idb-keyval';

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
 * Drop the persisted cache on sign-out so the next user starts clean. Called
 * by AuthGate's onAuthStateChange handler. Synchronous from the caller's POV;
 * the IDB delete races with the next sign-in's hydration but is idempotent.
 */
export const clearPersistedCache = async (): Promise<void> => {
  queryClient.clear();
  await persister.removeClient();
};
