import { clear } from 'idb-keyval';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as StoreModule from './store';
import type { UpdateBoardEntry } from './types';

/**
 * Proving that IDB bookkeeping never decides a drained write's outcome (#449)
 * needs `putEntry`/`deleteEntry` to fail on demand, so this file mocks
 * `./store` while outbox.test.ts uses the real one. Both mocks default to the
 * real implementation, so a test that forces no failure hits fake-indexeddb.
 */
const putEntryMock = vi.fn<(entry: never) => Promise<void>>();
const deleteEntryMock = vi.fn<(id: string) => Promise<void>>();

vi.mock('./store', async (importOriginal) => {
  const actual = await importOriginal<typeof StoreModule>();
  return { ...actual, putEntry: putEntryMock, deleteEntry: deleteEntryMock };
});

const selectMock = vi.fn<() => Promise<{ data: { updated_at: string }[]; error: null }>>();
// The select is the terminal of the chain and carries no board, so a test that
// needs one board to land and another to fail reads the id from here.
let lastBoardId = '';
const eqMock = vi.fn((_c: string, v: string) => {
  lastBoardId = v;
  return { select: selectMock };
});
const matchMock = vi.fn((_filter: Record<string, string>) => ({ select: selectMock }));
const updateMock = vi.fn(() => ({ eq: eqMock, match: matchMock }));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (_table: string) => ({ update: updateMock }) },
}));

vi.mock('@/lib/platform/telemetry', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

const realStore = await vi.importActual<typeof StoreModule>('./store');
const { drain } = await import('./drain');
const { drainState } = await import('./drain-state');
const { listEntries } = await import('./store');
const { __resetOutboxOwnerForTests, setOwnerId } = await import('./owner');
const { captureException } = await import('@/lib/platform/telemetry');

const captureExceptionMock = vi.mocked(captureException);

const baseEntry = (over: Partial<UpdateBoardEntry> = {}): UpdateBoardEntry => ({
  id: '01HZZZZZZZZZZZZZZZZZZZZZZZ',
  kind: 'updateBoard',
  boardId: 'board-1',
  patch: { name: 'New name' },
  enqueuedAt: 0,
  attemptCount: 0,
  status: 'pending',
  ...over,
});

const closed = (): DOMException => new DOMException('Closed', 'InvalidStateError');

/**
 * One real macrotask round, for the tests that fake setTimeout. MessageChannel,
 * not setTimeout: fake-indexeddb settles its work on real macrotasks that a
 * fake clock would never reach.
 */
const realTick = (): Promise<void> =>
  new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });

beforeEach(async () => {
  await clear();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  __resetOutboxOwnerForTests();
  setOwnerId('user-a');
  putEntryMock.mockReset().mockImplementation(realStore.putEntry as (e: never) => Promise<void>);
  deleteEntryMock.mockReset().mockImplementation(realStore.deleteEntry);
  eqMock.mockClear();
  updateMock.mockClear();
  lastBoardId = '';
  captureExceptionMock.mockClear();
  selectMock
    .mockReset()
    .mockResolvedValue({ data: [{ updated_at: '2026-06-11T09:00:00.000001+00:00' }], error: null });
});

describe('drain when IndexedDB cannot be written', () => {
  // The signature of the bug: the delete failure was classified as a handler
  // failure, so the entry burnt an attempt and carried the IndexedDB error
  // text as its lastError, on the way to a `failed` pill (#449).
  it('does not treat a failed delete as a failed write', async () => {
    await realStore.putEntry(baseEntry({ id: '01HZZA' }));
    deleteEntryMock.mockRejectedValue(closed());

    await drain();

    expect(eqMock).toHaveBeenCalledTimes(1);
    const entries = await listEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.status).toBe('pending');
    expect(entries[0]?.attemptCount).toBe(0);
    expect(entries[0]?.lastError).toBeUndefined();
  });

  it('reports the failed delete instead of failing silently', async () => {
    await realStore.putEntry(baseEntry({ id: '01HZZA' }));
    deleteEntryMock.mockRejectedValue(closed());

    await drain();

    expect(captureExceptionMock).toHaveBeenCalledWith(
      expect.any(DOMException),
      expect.objectContaining({ tags: { component: 'outbox', op: 'drain-delete-after-landing' } }),
    );
  });

  // An entry still queued for replay must not be overtaken. Running the later
  // write first leaves the earlier one to replay on top of it: the board ends
  // at the older name on the server while the cache shows the newer one.
  it('stops the pass at an entry it could not clear', async () => {
    await realStore.putEntry(baseEntry({ id: '01HZZA', patch: { name: 'X' } }));
    await realStore.putEntry(baseEntry({ id: '01HZZB', patch: { name: 'Y' } }));
    deleteEntryMock.mockRejectedValue(closed());

    await drain();

    expect(eqMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect((await listEntries()).map((e) => e.id)).toEqual(['01HZZA', '01HZZB']);
  });

  it('drains the entry behind it once a delete works', async () => {
    await realStore.putEntry(baseEntry({ id: '01HZZA' }));
    await realStore.putEntry(baseEntry({ id: '01HZZB', boardId: 'board-2' }));
    deleteEntryMock.mockRejectedValueOnce(closed());

    await drain();
    await drain();

    expect(eqMock).toHaveBeenCalledWith('id', 'board-2');
    expect(await listEntries()).toEqual([]);
  });

  // The backoff doubles only while a pass makes no progress, and the same
  // write re-landing every pass is not progress: it reset the delay to 2 s
  // forever, so an entry queued behind burnt its six attempts in ~10 s rather
  // than the ~60 s MAX_ATTEMPTS_BEFORE_FAILED is sized against.
  it('does not count a landed entry it could not clear as queue progress', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await realStore.putEntry(baseEntry({ id: '01HZZA' }));
      await realStore.putEntry(baseEntry({ id: '01HZZB', boardId: 'board-2' }));
      deleteEntryMock.mockRejectedValue(closed());
      selectMock.mockImplementation(async () => {
        if (lastBoardId === 'board-2') throw new TypeError('Failed to fetch');
        return { data: [{ updated_at: '2026-06-11T09:00:00.000001+00:00' }], error: null };
      });

      await drain();
      await drain();

      // Two passes each armed a retry: 2 s then 4 s, leaving 8 s next.
      expect(drainState.retryDelayMs).toBe(8_000);
    } finally {
      vi.useRealTimers();
    }
  });

  // Nothing else would clear it: `retryFailed` only resets `failed` entries and
  // the indicator offers no button for a pending one, so without this timer the
  // "queued" pill sits there for a landed write until an unrelated drain (#449).
  it('schedules the re-drain that clears an entry it could not delete', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await realStore.putEntry(baseEntry({ id: '01HZZA' }));
      deleteEntryMock.mockRejectedValueOnce(closed());

      await drain();

      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(2_000);
      for (let i = 0; i < 200 && (await listEntries()).length > 0; i++) await realTick();
      expect(await listEntries()).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  // Forwarding the conflict baseline is the same class of bookkeeping as the
  // delete: it runs after the handler landed, so its failure must not re-queue
  // the write it followed (#449).
  it('does not treat a failed guard forward as a failed write', async () => {
    await realStore.putEntry(
      baseEntry({ id: '01HZZA', expectedUpdatedAt: '2026-06-11T08:00:00.000000+00:00' }),
    );
    await realStore.putEntry(
      baseEntry({ id: '01HZZB', expectedUpdatedAt: '2026-06-11T08:00:00.000000+00:00' }),
    );
    putEntryMock.mockRejectedValue(closed());

    await drain();

    expect(captureExceptionMock).toHaveBeenCalledWith(
      expect.any(DOMException),
      expect.objectContaining({ tags: { component: 'outbox', op: 'drain-forward-board-guards' } }),
    );
    expect(putEntryMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ lastError: expect.stringContaining('Closed') }),
    );
  });
});
