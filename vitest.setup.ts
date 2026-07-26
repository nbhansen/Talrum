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
import { __resetSpeechForTests } from './src/lib/speech';
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

/**
 * Fail any test that logs to console.error (#387).
 *
 * React reports its correctness warnings this way — "Cannot update a component
 * while rendering a different component", "not wrapped in act(...)" — and they
 * are bugs wherever they appear, not just where someone thought to look. This
 * replaces a single test that walked the whole set-a-PIN flow purely to assert
 * `console.error` was never called during one transition: slow enough to time
 * out under coverage instrumentation about one run in four, and it pinned the
 * invariant for exactly one component.
 *
 * React deduplicates each warning per process, which is what made the old test
 * order-dependent — anything that tripped the warning first left it passing
 * silently. Checking globally makes that irrelevant: the first occurrence
 * anywhere fails the test it happened in, which is the one worth looking at.
 *
 * Tests that expect React to log — an ErrorBoundary catching a deliberate
 * throw — opt out for free by spying: `vi.spyOn(console, 'error')` replaces
 * this wrapper for the test's duration, so nothing is recorded. The caveat is
 * a spy that is never restored, which silently disables the check for the rest
 * of that *file* — vitest's default `isolate: true` re-executes this module per
 * test file, so the leak stops there rather than reaching the whole worker.
 *
 * The buffer below is per-file for the same reason, but it is shared by every
 * test in the file. That is fine while tests run one at a time, which they all
 * do today; under `it.concurrent` a log from one test would fail whichever
 * sibling happened to finish next, so this needs per-test context before any
 * concurrency is adopted.
 *
 * console.warn is deliberately not covered: `useSetStepIds` logs there on
 * purpose behind an `import.meta.env.DEV` guard.
 */
const originalConsoleError = console.error;
const consoleErrorCalls: unknown[][] = [];
console.error = (...args: unknown[]): void => {
  consoleErrorCalls.push(args);
  originalConsoleError(...args);
};

// #144 / #168: module-level caches in storage, outbox/drain, and speech persist
// across `it()` blocks within the same worker — a flake class whose failure
// mode depends on test order. Reset all three globally; pairs with idb-keyval's
// `clear()`. drain state lives in `./drain-state.ts` (no Supabase deps) for
// the same tsconfig.node.json reason as `storage-cache.ts`.
afterEach(async () => {
  await clear();
  __resetSignedUrlCache();
  __resetSpeechForTests();
  __resetDrainForTests();
  __resetBoardClockForTests();
});

// Registered last so the resets above always run, even on the throw.
afterEach(() => {
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
