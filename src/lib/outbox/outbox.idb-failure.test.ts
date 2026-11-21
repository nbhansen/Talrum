import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { baseEntry, closed, realTick, setOnline } from './outbox.test-utils';
import type * as StoreModule from './store';
import type { OutboxEntry } from './types';

// `./store` is mocked so that IndexedDB can fail on demand (#446, #449, #458).
// Each mock defaults to the real store, so a test that forces no failure hits
// fake-indexeddb.
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

type SelectResult = Promise<{
  data: { updated_at: string }[] | null;
  error: { code: string; message: string; details: string; hint: string } | null;
}>;
const selectMock = vi.fn<() => SelectResult>();
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
const { enqueueAndDrain, retryFailed } = await import('./index');
const { setOwnerId } = await import('./owner');
const { captureException } = await import('@/lib/platform/telemetry');

const captureExceptionMock = vi.mocked(captureException);

const fakeTimers = (): void => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
};

/** The give-up counts timer wakes, so a test that spends it must pass one. */
const timerDrains = async (count: number): Promise<void> => {
  for (let i = 0; i < count; i++) await drain({ fromTimer: true });
};

const failingDrains = async (count: number): Promise<void> => {
  listEntriesMock.mockRejectedValue(closed());
  await timerDrains(count);
};

beforeEach(() => {
  setOnline(true);
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

afterEach(() => {
  vi.useRealTimers();
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
    fakeTimers();
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
  });

  // A record that cannot be deserialized rejects every read, so the timer
  // would wake every 30 s for the rest of the session and spend telemetry
  // quota on a queue that cannot heal without an external trigger.
  it('stops arming the retry after six passes it cannot read', async () => {
    fakeTimers();
    await failingDrains(5);
    expect(vi.getTimerCount()).toBe(1);

    await drain({ fromTimer: true });

    expect(vi.getTimerCount()).toBe(0);
  });

  // Every write drains, and an unreadable queue sends each one down the
  // queued-unattempted branch, so a burst would empty the budget in a second.
  it('keeps the give-up budget for drains a write triggered', async () => {
    fakeTimers();
    listEntriesMock.mockRejectedValue(closed());

    for (let i = 0; i < 8; i++) await drain();

    expect(vi.getTimerCount()).toBe(1);
  });

  // A failed status read does not prove the pass was blocked, because
  // `reconcileQueue` reads again. Spending the budget on one would end the
  // #391 ladder for a network outage.
  it('keeps the give-up budget for a pass that only failed its status read', async () => {
    fakeTimers();
    for (let i = 0; i < 3; i++) await realStore.putEntry(baseEntry({ id: `01HZZ${i}` }));
    selectMock.mockRejectedValue(new TypeError('Failed to fetch'));

    for (let i = 0; i < 8; i++) {
      listEntriesMock.mockRejectedValueOnce(closed());
      await drain({ fromTimer: true });
    }

    expect(vi.getTimerCount()).toBe(1);
  });

  // The backoff and the give-up count are two halves of one schedule, so a
  // Retry that reset only the delay would still get no ladder.
  it('gives a Retry a fresh give-up budget', async () => {
    fakeTimers();
    await realStore.putEntry(baseEntry({ id: '01HZZA', status: 'attempting' }));
    putEntryMock.mockRejectedValue(new DOMException('Quota', 'QuotaExceededError'));
    await timerDrains(8);
    expect(vi.getTimerCount()).toBe(0);

    await retryFailed();

    expect(vi.getTimerCount()).toBe(1);
  });

  // Otherwise the give-up lasts the session: the entries are `pending`, so the
  // indicator renders no Retry, and only this cycle is left.
  it('gives an offline-to-online cycle a fresh give-up budget', async () => {
    fakeTimers();
    await realStore.putEntry(baseEntry({ id: '01HZZA', status: 'attempting' }));
    putEntryMock.mockRejectedValue(new DOMException('Quota', 'QuotaExceededError'));
    await timerDrains(8);
    expect(vi.getTimerCount()).toBe(0);

    setOnline(false);
    await drain();
    setOnline(true);
    await drain();

    expect(vi.getTimerCount()).toBe(1);
  });

  // A pass that lands entries is not stalled, whatever else failed in it, so
  // it must not spend the give-up budget.
  it('keeps arming the retry for a pass that drained something', async () => {
    fakeTimers();
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

describe('drain when IndexedDB cannot be written', () => {
  // The signature of the bug: the delete failure was classified as a handler
  // failure, so the entry burnt an attempt and carried the IndexedDB error
  // text as its lastError, on the way to a `failed` pill (#449).
  it('does not treat a failed delete as a failed write', async () => {
    await realStore.putEntry(baseEntry({ id: '01HZZA' }));
    deleteEntryMock.mockRejectedValue(closed());

    await drain();

    expect(eqMock).toHaveBeenCalledTimes(1);
    const entries = await realStore.listEntries();
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
    expect((await realStore.listEntries()).map((e) => e.id)).toEqual(['01HZZA', '01HZZB']);
  });

  it('drains the entry behind it once a delete works', async () => {
    await realStore.putEntry(baseEntry({ id: '01HZZA' }));
    await realStore.putEntry(baseEntry({ id: '01HZZB', boardId: 'board-2' }));
    deleteEntryMock.mockRejectedValueOnce(closed());

    await drain();
    await drain();

    expect(eqMock).toHaveBeenCalledWith('id', 'board-2');
    expect(await realStore.listEntries()).toEqual([]);
  });

  // Nothing else would clear it: `retryFailed` only resets `failed` entries and
  // the indicator offers no button for a pending one, so without this timer the
  // "queued" pill sits there for a landed write until an unrelated drain (#449).
  it('schedules the re-drain that clears an entry it could not delete', async () => {
    fakeTimers();
    await realStore.putEntry(baseEntry({ id: '01HZZA' }));
    deleteEntryMock.mockRejectedValueOnce(closed());

    await drain();

    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(2_000);
    for (let i = 0; i < 200 && (await realStore.listEntries()).length > 0; i++) await realTick();
    expect(await realStore.listEntries()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
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

describe('enqueueAndDrain when IndexedDB cannot be written', () => {
  beforeEach(() => {
    setOwnerId(null);
  });

  it('still runs the online write and resolves', async () => {
    putEntryMock.mockRejectedValue(new DOMException('Quota', 'QuotaExceededError'));

    await expect(
      enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } }),
    ).resolves.toBeUndefined();

    // The handler ran. Rejecting here would fail a write the network accepted.
    expect(eqMock).toHaveBeenCalledWith('id', 'b');
    expect(await realStore.listEntries()).toEqual([]);
  });

  it('reports the lost durability instead of failing silently', async () => {
    putEntryMock.mockRejectedValue(new DOMException('Quota', 'QuotaExceededError'));

    await enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } });

    expect(captureExceptionMock).toHaveBeenCalledWith(
      expect.any(DOMException),
      expect.objectContaining({ tags: { component: 'outbox', op: 'persist-before-attempt' } }),
    );
  });

  // A failed delete is not a failed handler. Classifying it as one replayed a
  // write the server had accepted and put the IndexedDB error text in the
  // entry's lastError (#446 review).
  it('does not treat a failed delete as a failed write', async () => {
    deleteEntryMock.mockRejectedValue(new DOMException('Closed', 'InvalidStateError'));

    await expect(
      enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } }),
    ).resolves.toBeUndefined();

    expect(captureExceptionMock).toHaveBeenCalledWith(
      expect.any(DOMException),
      expect.objectContaining({ tags: { component: 'outbox', op: 'delete-after-landing' } }),
    );
    // The write landed and the handler ran once. A transient re-queue would
    // have replayed it immediately.
    expect(eqMock).toHaveBeenCalledTimes(1);
    // The entry outlived the write it recorded, but as `attempting`: no count
    // names it and no drain replays it until one adopts it. That needs no
    // follow-up here — it is the abandoned-attempt case, which the next lock
    // holder resolves.
    expect((await realStore.listEntries())[0]?.status).toBe('attempting');
    // The signature of the bug: classifying the delete failure as a handler
    // failure re-queued the entry with the IndexedDB error as its lastError.
    expect(putEntryMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ lastError: expect.stringContaining('Closed') }),
    );
  });

  // With the entry already queued, the retry bookkeeping is only bookkeeping:
  // the drain replays the write whether or not the attempt count landed.
  it('keeps a transient write queued when only the retry bookkeeping fails', async () => {
    selectMock.mockRejectedValue(new TypeError('Failed to fetch'));
    putEntryMock.mockImplementationOnce(realStore.putEntry as (e: never) => Promise<void>);
    putEntryMock.mockRejectedValueOnce(new DOMException('Closed', 'InvalidStateError'));

    await expect(
      enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } }),
    ).resolves.toBeUndefined();

    expect(await realStore.listEntries()).toHaveLength(1);
    expect(captureExceptionMock).toHaveBeenCalledWith(
      expect.any(DOMException),
      expect.objectContaining({ tags: { component: 'outbox', op: 'record-transient-attempt' } }),
    );
  });

  // The entry outlived a write the UI rolled back. As `pending` it would sit
  // in the count for a write the user watched fail (#446 review).
  it('leaves an uncleared permanent failure out of the count', async () => {
    selectMock.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied', details: '', hint: '' },
    });
    deleteEntryMock.mockRejectedValue(new DOMException('Closed', 'InvalidStateError'));

    await expect(
      enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } }),
    ).rejects.toThrow();

    expect((await realStore.listEntries())[0]?.status).toBe('attempting');
    await refreshStatus();
    expect(getStatus().pendingCount).toBe(0);
  });

  // Both puts failed, so nothing is queued. Resolving here would report the
  // write as saved while it vanished — the silent loss #445 is about.
  it('rejects a transient write when no put lands, rather than claiming it is queued', async () => {
    selectMock.mockRejectedValue(new TypeError('Failed to fetch'));
    putEntryMock.mockRejectedValue(new DOMException('Quota', 'QuotaExceededError'));

    await expect(
      enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } }),
    ).rejects.toThrow(DOMException);

    expect(await realStore.listEntries()).toEqual([]);
  });
});
