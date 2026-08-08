import { clear } from 'idb-keyval';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as StoreModule from './store';
import type { OutboxEntry, UpdateBoardEntry } from './types';

/**
 * Proving that an unreadable IndexedDB never decides a write's outcome (#458)
 * needs `listEntries` to fail on demand, so this file mocks `./store` while
 * outbox.test.ts uses the real one. The mock defaults to the real
 * implementation, so a test that forces no failure hits fake-indexeddb.
 */
const listEntriesMock = vi.fn<() => Promise<OutboxEntry[]>>();

vi.mock('./store', async (importOriginal) => {
  const actual = await importOriginal<typeof StoreModule>();
  return { ...actual, listEntries: listEntriesMock };
});

const selectMock = vi.fn<() => Promise<{ data: { updated_at: string }[]; error: null }>>();
const eqMock = vi.fn((_c: string, _v: string) => ({ select: selectMock }));
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
const { drain, getStatus, refreshStatus } = await import('./drain');
const { drainState } = await import('./drain-state');
const { enqueueAndDrain } = await import('./index');
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

const setOnline = (value: boolean): void => {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
};

const failingDrains = async (count: number): Promise<void> => {
  listEntriesMock.mockRejectedValue(closed());
  for (let i = 0; i < count; i++) await drain();
};

beforeEach(async () => {
  await clear();
  setOnline(true);
  __resetOutboxOwnerForTests();
  setOwnerId('user-a');
  listEntriesMock.mockReset().mockImplementation(realStore.listEntries);
  eqMock.mockClear();
  matchMock.mockClear();
  updateMock.mockClear();
  captureExceptionMock.mockClear();
  selectMock
    .mockReset()
    .mockResolvedValue({ data: [{ updated_at: '2026-06-11T09:00:00.000001+00:00' }], error: null });
});

describe('drain when IndexedDB cannot be read', () => {
  // `drain` awaits the status emit outside its try, with `draining` already
  // set. A rejection there left the flag set, and every later drain took the
  // re-entrancy branch, so the tab never drained again (#458).
  it('does not stop draining for good when the status read fails', async () => {
    await realStore.putEntry(baseEntry({ id: '01HZZA' }));
    listEntriesMock.mockRejectedValueOnce(closed());

    await expect(drain()).resolves.toBeUndefined();

    expect(drainState.draining).toBe(false);
    expect(eqMock).toHaveBeenCalledTimes(1);
    expect(await realStore.listEntries()).toEqual([]);
  });

  it('reports the failed status read instead of failing silently', async () => {
    await realStore.putEntry(baseEntry({ id: '01HZZA' }));
    listEntriesMock.mockRejectedValueOnce(closed());

    await drain();

    expect(captureExceptionMock).toHaveBeenCalledWith(
      expect.any(DOMException),
      expect.objectContaining({ tags: { component: 'outbox', op: 'emit-list-entries' } }),
    );
  });

  it('abandons the pass and arms a retry when the queue read fails', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await realStore.putEntry(baseEntry({ id: '01HZZA' }));
      // The first read is the status emit; the second is `reconcileQueue`.
      listEntriesMock.mockImplementationOnce(realStore.listEntries).mockRejectedValueOnce(closed());

      await expect(drain()).resolves.toBeUndefined();

      expect(captureExceptionMock).toHaveBeenCalledWith(
        expect.any(DOMException),
        expect.objectContaining({ tags: { component: 'outbox', op: 'drain-pass' } }),
      );
      expect(updateMock).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  // A record that cannot be deserialized rejects every read, so the timer
  // would wake every 30 s for the rest of the session and spend telemetry
  // quota on a queue that cannot heal without an external trigger.
  it('stops arming the retry after six passes it cannot read', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await failingDrains(5);
      expect(vi.getTimerCount()).toBe(1);

      await drain();

      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('arms the retry again once a pass completes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await failingDrains(6);
      listEntriesMock.mockImplementation(realStore.listEntries);
      await drain();

      listEntriesMock.mockRejectedValue(closed());
      await drain();

      expect(vi.getTimerCount()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  // The harm #458 names: the mutation promise rejects for a write already on
  // disk, so React Query rolls back a patch the next drain would have landed.
  it('does not roll back a write it has already queued', async () => {
    setOnline(false);
    listEntriesMock.mockRejectedValue(closed());

    await expect(
      enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } }),
    ).resolves.toBeUndefined();

    expect(await realStore.listEntries()).toHaveLength(1);
  });

  // An unreadable queue is not an empty queue. Taking the fast path here runs
  // the new write ahead of entries it cannot see, and they overwrite it when
  // they replay (#279).
  it('queues a write it cannot prove the queue is empty for', async () => {
    await realStore.putEntry(baseEntry({ id: '01HZZA' }));
    listEntriesMock.mockRejectedValue(closed());

    await expect(
      enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } }),
    ).resolves.toBeUndefined();

    expect(updateMock).not.toHaveBeenCalled();
    const entries = await realStore.listEntries();
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.status === 'pending')).toBe(true);
  });

  // Zeroing the counts the read could not produce would clear the pending pill
  // for writes that are still queued.
  it('keeps the last counts and still refreshes the flags', async () => {
    await realStore.putEntry(baseEntry({ id: '01HZZA' }));
    await refreshStatus();
    expect(getStatus().pendingCount).toBe(1);

    listEntriesMock.mockRejectedValue(closed());
    setOnline(false);

    await expect(refreshStatus()).resolves.toBeUndefined();

    expect(getStatus().pendingCount).toBe(1);
    expect(getStatus().online).toBe(false);
  });
});
