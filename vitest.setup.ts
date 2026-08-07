import '@testing-library/jest-dom/vitest';
// Phase 4 wires idb-keyval into queryClient + outbox; jsdom doesn't ship with
// indexedDB, so provide a Dexie-grade polyfill globally for every test that
// touches the persistence layer.
import 'fake-indexeddb/auto';

import { format } from 'node:util';

import { clear } from 'idb-keyval';
import { afterEach, vi } from 'vitest';

import { __resetBoardClockForTests } from './src/lib/outbox/board-clock';
import { __resetDrainForTests } from './src/lib/outbox/drain-state';
import { __resetSpeechForTests } from './src/lib/platform/speech';
import { __resetSignedUrlCache } from './src/lib/storage/storage-cache';

// A floor mock for every test file. Without it, a test that seeds the cache
// but does not mock the client races its own mount-time refetch (#24). Files
// needing a richer mock override it per file. Tracked: #46.
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

/**
 * Fail any test that logs to console.error (#387): React reports its
 * correctness warnings there, and they are bugs wherever they appear. A test
 * that expects one opts out by spying. `console.warn` is not covered, because
 * `useSetStepIds` logs there on purpose.
 */
const originalConsoleError = console.error;
const consoleErrorCalls: unknown[][] = [];
console.error = (...args: unknown[]): void => {
  consoleErrorCalls.push(args);
  originalConsoleError(...args);
};

// Module-level caches in storage, outbox/drain and speech outlive an `it()`
// block, a flake class whose failure depends on test order (#144, #168). One
// hook, not two, with the console check last: `sequence.hooks: 'stack'` runs
// afterEach in reverse, so the guard alone would skip these resets on failure.
afterEach(async () => {
  await clear();
  __resetSignedUrlCache();
  __resetSpeechForTests();
  __resetDrainForTests();
  __resetBoardClockForTests();

  const calls = consoleErrorCalls.splice(0);
  if (calls.length === 0) return;
  throw new Error(
    `console.error was called ${calls.length} time(s) during this test.\n` +
      'React reports correctness warnings this way, so treat it as the bug it is. ' +
      'If the log is expected (an ErrorBoundary catching a deliberate throw), ' +
      "silence it in the test with vi.spyOn(console, 'error').\n\n" +
      // format() so React's `%s` placeholders are filled in — the raw args are
      // the format string followed by the component names, which reads as
      // gibberish at exactly the moment someone needs to understand it.
      calls.map((args) => format(...args)).join('\n'),
  );
});
