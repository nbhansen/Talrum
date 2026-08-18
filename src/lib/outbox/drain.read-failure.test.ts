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
const putEntryMock = vi.fn<(entry: never) => Promise<void>>();
const deleteEntryMock = vi.fn<(id: string) => Promise<void>>();

vi.mock('./store', async (importOriginal) => {
  const actual = await importOriginal<typeof StoreModule>();
  return {
    ...actual,
    listEntries: listEntriesMock,
    putEntry: putEntryMock,
    deleteEntry: deleteEntryMock,
  };
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
const { drain, getStatus, refreshStatus, subscribeStatus } = await import('./drain');
const { drainState } = await import('./drain-state');
const { enqueueAndDrain, retryFailed } = await import('./index');
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

/** The give-up counts timer wakes, so a test that spends it must pass one. */
const timerDrains = async (count: number): Promise<void> => {
  for (let i = 0; i < count; i++) await drain({ fromTimer: true });
};

const failingDrains = async (count: number): Promise<void> => {
  listEntriesMock.mockRejectedValue(closed());
  await timerDrains(count);
};

beforeEach(async () => {
  await clear();
  setOnline(true);
  __resetOutboxOwnerForTests();
  setOwnerId('user-a');
  listEntriesMock.mockReset().mockImplementation(realStore.listEntries);
  putEntryMock.mockReset().mockImplementation(realStore.putEntry as (e: never) => Promise<void>);
  deleteEntryMock.mockReset().mockImplementation(realStore.deleteEntry);
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

  // `draining` is set before the status emit and cleared in the drain's
  // finally, so anything the emit throws bricks the tab's drain. Guarding the
  // read closed the reachable door; the subscribers were the one left open.
  it('survives a subscriber that throws', async () => {
    let calls = 0;
    const unsubscribe = subscribeStatus(() => {
      calls += 1;
      if (calls > 1) throw new Error('boom');
    });
    try {
      await realStore.putEntry(baseEntry({ id: '01HZZA' }));

      await expect(drain()).resolves.toBeUndefined();

      expect(drainState.draining).toBe(false);
      expect(await realStore.listEntries()).toEqual([]);
    } finally {
      unsubscribe();
    }
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

      await drain({ fromTimer: true });

      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  // A full disk fails every write, so the read alone cannot bound the timer.
  // What the give-up counts is a drain that achieved nothing, whichever
  // IndexedDB call failed.
  it('stops arming the retry when a write fails every pass', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await realStore.putEntry(baseEntry({ id: '01HZZA', status: 'attempting' }));
      // `reconcileQueue` promotes the abandoned attempt, and that put throws.
      putEntryMock.mockRejectedValue(new DOMException('Quota', 'QuotaExceededError'));

      await timerDrains(8);

      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  // Every write drains, and an unreadable queue sends each one down the
  // queued-unattempted branch, so a burst would empty the budget in a second.
  it('keeps the give-up budget for drains a write triggered', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      listEntriesMock.mockRejectedValue(closed());

      for (let i = 0; i < 8; i++) await drain();

      expect(vi.getTimerCount()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  // A failed status read does not prove the pass was blocked, because
  // `reconcileQueue` reads again. Spending the budget on one would end the
  // #391 ladder for a network outage.
  it('keeps the give-up budget for a pass that only failed its status read', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      for (let i = 0; i < 3; i++) await realStore.putEntry(baseEntry({ id: `01HZZ${i}` }));
      selectMock.mockRejectedValue(new TypeError('Failed to fetch'));

      for (let i = 0; i < 8; i++) {
        listEntriesMock.mockRejectedValueOnce(closed());
        await drain({ fromTimer: true });
      }

      expect(vi.getTimerCount()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  // The backoff and the give-up count are two halves of one schedule, so a
  // Retry that reset only the delay would still get no ladder.
  it('gives a Retry a fresh give-up budget', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await realStore.putEntry(baseEntry({ id: '01HZZA', status: 'attempting' }));
      putEntryMock.mockRejectedValue(new DOMException('Quota', 'QuotaExceededError'));
      await timerDrains(8);
      expect(vi.getTimerCount()).toBe(0);

      await retryFailed();

      expect(vi.getTimerCount()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  // A landed write is progress even when the queue keeps its entry, so it must
  // not spend the budget. #459 owns the bound on that replay.
  it('keeps arming the retry for a landed write it could not clear', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await realStore.putEntry(baseEntry({ id: '01HZZA' }));
      deleteEntryMock.mockRejectedValue(closed());

      for (let i = 0; i < 8; i++) {
        // The entry lands and stays queued, then the end-of-pass re-read throws.
        listEntriesMock
          .mockImplementationOnce(realStore.listEntries)
          .mockImplementationOnce(realStore.listEntries)
          .mockImplementationOnce(realStore.listEntries)
          .mockRejectedValueOnce(closed());
        await drain({ fromTimer: true });
      }

      expect(vi.getTimerCount()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  // Otherwise the give-up lasts the session: the entries are `pending`, so the
  // indicator renders no Retry, and only this cycle is left.
  it('gives an offline-to-online cycle a fresh give-up budget', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await realStore.putEntry(baseEntry({ id: '01HZZA', status: 'attempting' }));
      putEntryMock.mockRejectedValue(new DOMException('Quota', 'QuotaExceededError'));
      await timerDrains(8);
      expect(vi.getTimerCount()).toBe(0);

      setOnline(false);
      await drain();
      setOnline(true);
      await drain();

      expect(vi.getTimerCount()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  // A pass that lands entries is not stalled, whatever else failed in it, so
  // it must not spend the give-up budget.
  it('keeps arming the retry for a pass that drained something', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      for (let i = 0; i < 8; i++) {
        await realStore.putEntry(baseEntry({ id: `01HZZ${i}` }));
        // The entry lands and clears, then the end-of-pass re-read throws.
        listEntriesMock
          .mockImplementationOnce(realStore.listEntries)
          .mockImplementationOnce(realStore.listEntries)
          .mockImplementationOnce(realStore.listEntries)
          .mockRejectedValueOnce(closed());
        await drain({ fromTimer: true });
      }

      expect(vi.getTimerCount()).toBe(1);
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

  // The counts a failed read keeps are the last good ones, and after a clean
  // drain those are zero. Without a state for the read itself, a write that
  // queues durably behind an unreadable queue reports as synced (#462).
  it('names the unreadable queue after a clean drain', async () => {
    await drain();
    expect(getStatus()).toMatchObject({ pendingCount: 0, queueUnreadable: false });
    listEntriesMock.mockRejectedValue(closed());

    await enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } });

    expect(getStatus().queueUnreadable).toBe(true);
    expect(await realStore.listEntries()).toHaveLength(1);
  });

  it('clears the unreadable state once a read succeeds', async () => {
    listEntriesMock.mockRejectedValue(closed());
    await drain();
    expect(getStatus().queueUnreadable).toBe(true);
    listEntriesMock.mockImplementation(realStore.listEntries);

    await drain();

    expect(getStatus().queueUnreadable).toBe(false);
  });

  // The Retry button's only caller drops the promise, so a rejection here
  // reached nobody: no telemetry, no state change, a button that did nothing
  // (#461, folded into #462).
  it('reports a Retry it cannot read the queue for and names the state', async () => {
    await realStore.putEntry(baseEntry({ id: '01HZZA', status: 'failed' }));
    listEntriesMock.mockRejectedValue(closed());

    await expect(retryFailed()).resolves.toBeUndefined();

    expect(captureExceptionMock).toHaveBeenCalledWith(
      expect.any(DOMException),
      expect.objectContaining({ tags: { component: 'outbox', op: 'retry-list-entries' } }),
    );
    expect(getStatus().queueUnreadable).toBe(true);
    expect((await realStore.listEntries())[0]?.status).toBe('failed');
  });
});
