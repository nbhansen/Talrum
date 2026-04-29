import '@testing-library/jest-dom/vitest';
// Phase 4 wires idb-keyval into queryClient + outbox; jsdom doesn't ship with
// indexedDB, so provide a Dexie-grade polyfill globally for every test that
// touches the persistence layer.
import 'fake-indexeddb/auto';

import { clear } from 'idb-keyval';
import { afterEach, vi } from 'vitest';

import { __resetSignedUrlCache } from './src/lib/storage-cache';

// Default-stub the Supabase client for every test file. #24 was a warm-vs-cold
// flake: a test seeded the React Query cache but didn't mock @/lib/supabase,
// so useQuery's mount-time refetch raced against the seeded data and replaced
// it with []. This floor mock makes that whole class of bug structurally
// impossible — any new test that mounts a hook + seeds the cache is safe by
// default. Files that need a richer mock (real `from`, auth surface, etc.)
// override per-file with their own vi.mock('@/lib/supabase', ...). Tracked: #46.
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

// Node 25's experimental `localStorage` global (no `--localstorage-file` passed)
// ends up shadowing jsdom's Storage implementation with an empty shell that has
// none of the Storage methods. Replace it with an in-memory shim for tests.
const memoryStorage = (): Storage => {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
    key: (i) => Array.from(map.keys())[i] ?? null,
  };
};

Object.defineProperty(window, 'localStorage', {
  value: memoryStorage(),
  configurable: true,
});
Object.defineProperty(window, 'sessionStorage', {
  value: memoryStorage(),
  configurable: true,
});

// #144: signedUrlFor persists to idb-keyval and an in-process Map. Without a
// global reset, a future test file that mounts a hook touching signedUrlFor
// inherits cached entries from prior tests in the same worker — a flake whose
// failure mode depends on test order.
afterEach(async () => {
  await clear();
  __resetSignedUrlCache();
});
