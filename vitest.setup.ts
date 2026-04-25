import '@testing-library/jest-dom/vitest';
// Phase 4 wires idb-keyval into queryClient + outbox; jsdom doesn't ship with
// indexedDB, so provide a Dexie-grade polyfill globally for every test that
// touches the persistence layer.
import 'fake-indexeddb/auto';

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
