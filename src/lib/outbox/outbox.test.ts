import { clear, keys } from 'idb-keyval';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { UpdateBoardEntry } from './types';

interface MockPostgrestError {
  code: string;
  message: string;
  details: string;
  hint: string;
}
type UpdateSelectResult = Promise<{
  data: { updated_at: string }[] | null;
  error: MockPostgrestError | null;
}>;
const guardSelectMock = vi.fn<(cols: string) => UpdateSelectResult>();
const unguardedSelectMock = vi.fn<(cols: string) => UpdateSelectResult>();
// Unguarded chain: `.update().eq('id', ...).select('updated_at')`. eqMock
// stays a spy on the (column, value) pair; the select call is the terminal.
const eqMock = vi.fn((_c: string, _v: string) => ({ select: unguardedSelectMock }));
const matchMock = vi.fn((_filter: Record<string, string>) => ({ select: guardSelectMock }));
const updateMock = vi.fn(() => ({ eq: eqMock, match: matchMock }));
const fromMock = vi.fn((_table: string) => ({ update: updateMock }));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (table: string) => fromMock(table) },
}));

const { deleteEntry, listEntries, putEntry } = await import('./store');
const { drain, getStatus, refreshStatus, startOutbox, subscribeStatus } = await import('./drain');
const { discardEntry, enqueueAndDrain, retryFailed } = await import('./index');
const { BOARD_CONFLICT_MESSAGE } = await import('./handlers');
const { __resetBoardClockForTests } = await import('./board-clock');

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

const setOnline = (online: boolean): void => {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
};

beforeEach(async () => {
  await clear();
  setOnline(true);
  updateMock.mockClear();
  fromMock.mockClear();
  eqMock.mockClear();
  guardSelectMock.mockReset();
  unguardedSelectMock.mockReset();
  matchMock.mockClear();
  // Default: handler succeeds.
  unguardedSelectMock.mockResolvedValue({
    data: [{ updated_at: '2026-06-11T09:00:00.000001+00:00' }],
    error: null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('outbox store', () => {
  it('putEntry + listEntries round-trips a single entry', async () => {
    await putEntry(baseEntry({ id: '01HZZA' }));
    const entries = await listEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe('01HZZA');
  });

  it('listEntries returns ULID order', async () => {
    await putEntry(baseEntry({ id: '01HZZB' }));
    await putEntry(baseEntry({ id: '01HZZA' }));
    await putEntry(baseEntry({ id: '01HZZC' }));
    const ids = (await listEntries()).map((e) => e.id);
    expect(ids).toEqual(['01HZZA', '01HZZB', '01HZZC']);
  });

  it('deleteEntry removes the keyed entry', async () => {
    await putEntry(baseEntry({ id: '01HZZA' }));
    await deleteEntry('01HZZA');
    const entries = await listEntries();
    expect(entries).toHaveLength(0);
    // No stray IDB key left behind.
    const remaining = (await keys()).filter(
      (k) => typeof k === 'string' && k.startsWith('outbox:'),
    );
    expect(remaining).toEqual([]);
  });
});

describe('outbox drain', () => {
  it('drains pending entries in FIFO order then deletes them', async () => {
    await putEntry(baseEntry({ id: '01HZZA' }));
    await putEntry(baseEntry({ id: '01HZZB' }));
    await drain();
    expect(eqMock).toHaveBeenCalledTimes(2);
    expect(await listEntries()).toEqual([]);
  });

  it('does not run handlers when offline', async () => {
    setOnline(false);
    await putEntry(baseEntry({ id: '01HZZA' }));
    await drain();
    expect(eqMock).not.toHaveBeenCalled();
    expect(await listEntries()).toHaveLength(1);
  });

  it('marks an entry as failed after MAX_ATTEMPTS transient failures', async () => {
    unguardedSelectMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await putEntry(baseEntry({ id: '01HZZA' }));
    await drain();
    await drain();
    await drain();
    const entries = await listEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.status).toBe('failed');
    expect(entries[0]?.attemptCount).toBeGreaterThanOrEqual(3);
  });

  it('marks an entry as failed immediately on a coded (non-retryable) error', async () => {
    unguardedSelectMock.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied', details: '', hint: '' },
    });
    await putEntry(baseEntry({ id: '01HZZA' }));
    await drain();
    const entries = await listEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.status).toBe('failed');
    expect(entries[0]?.attemptCount).toBe(1);
  });

  it('stops on a transient failure so order is preserved across the queue', async () => {
    unguardedSelectMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue({
        data: [{ updated_at: '2026-06-11T09:00:01.000001+00:00' }],
        error: null,
      });
    await putEntry(baseEntry({ id: '01HZZA' }));
    await putEntry(baseEntry({ id: '01HZZB' }));
    await drain();
    // The second entry was never attempted because the first stayed pending.
    expect(eqMock).toHaveBeenCalledTimes(1);
    const remaining = await listEntries();
    expect(remaining.map((e) => e.id)).toEqual(['01HZZA', '01HZZB']);
  });
});

describe('cross-tab coordination (#278, #289)', () => {
  /**
   * Minimal Web Locks fake: serializes callbacks per lock name via a promise
   * chain. jsdom has no `navigator.locks`, so installing this opts drain()
   * into its locked path; the surrounding afterEach removes it again.
   */
  const installFakeLocks = () => {
    const chains = new Map<string, Promise<unknown>>();
    const request = vi.fn((name: string, cb: () => unknown): Promise<unknown> => {
      const prev = chains.get(name) ?? Promise.resolve();
      const run = prev.then(() => cb());
      chains.set(
        name,
        run.then(
          () => undefined,
          () => undefined,
        ),
      );
      return run;
    });
    Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true });
    return request;
  };

  afterEach(() => {
    delete (navigator as { locks?: unknown }).locks;
  });

  it('drain waits for the talrum-outbox web lock held by another tab', async () => {
    const request = installFakeLocks();
    await putEntry(baseEntry({ id: '01HZZA' }));
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    // "Another tab" grabs the lock first.
    void navigator.locks.request('talrum-outbox', () => held);
    const drainDone = drain();
    // Wait until drain has queued its own lock request, then give the
    // microtask queue a chance to (incorrectly) run handlers anyway.
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2), { timeout: 5000 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(eqMock).not.toHaveBeenCalled();
    release();
    await drainDone;
    expect(eqMock).toHaveBeenCalledTimes(1);
    expect(await listEntries()).toEqual([]);
  });

  it('re-checks onLine after the lock wait so a dead network burns no attempts', async () => {
    const request = installFakeLocks();
    await putEntry(baseEntry({ id: '01HZZA' }));
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    void navigator.locks.request('talrum-outbox', () => held);
    const drainDone = drain();
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2), { timeout: 5000 });
    // The network drops while drain is parked on the other tab's lock — the
    // pre-lock online check is stale by the time the lock is granted.
    setOnline(false);
    release();
    await drainDone;
    expect(eqMock).not.toHaveBeenCalled();
    const entries = await listEntries();
    expect(entries[0]?.attemptCount).toBe(0);
  });

  it('does not resurrect an entry another tab completed mid-flight (permanent error)', async () => {
    await putEntry(baseEntry({ id: '01HZZA' }));
    unguardedSelectMock.mockImplementation(async () => {
      // Another tab finished this entry and deleted it while our attempt was
      // in flight; our duplicate write then hits a unique-key violation.
      await deleteEntry('01HZZA');
      return {
        data: null,
        error: { code: '23505', message: 'duplicate key', details: '', hint: '' },
      };
    });
    await drain();
    expect(await listEntries()).toEqual([]);
  });

  it('does not resurrect an entry another tab completed mid-flight (transient error)', async () => {
    await putEntry(baseEntry({ id: '01HZZA' }));
    unguardedSelectMock.mockImplementation(async () => {
      await deleteEntry('01HZZA');
      throw new TypeError('Failed to fetch');
    });
    await drain();
    expect(await listEntries()).toEqual([]);
  });

  it('retryFailed cannot resurrect an entry another tab discards while it waits (#289)', async () => {
    const request = installFakeLocks();
    await putEntry(baseEntry({ id: '01HZZA', status: 'failed', attemptCount: 3 }));
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Another tab holds the lock, mid-discard.
    void navigator.locks.request('talrum-outbox', () => held);
    const retryDone = retryFailed();
    // Once a second lock request is queued, an unlocked reset loop would
    // already have flipped the entry to pending — it must still be parked.
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2), { timeout: 5000 });
    expect((await listEntries())[0]?.status).toBe('failed');
    // The other tab's discard lands before the lock is released.
    await deleteEntry('01HZZA');
    release();
    await retryDone;
    expect(await listEntries()).toEqual([]);
    expect(eqMock).not.toHaveBeenCalled();
  });

  it('discardEntry waits for the talrum-outbox lock (#289)', async () => {
    const request = installFakeLocks();
    await putEntry(baseEntry({ id: '01HZZA', status: 'failed', attemptCount: 3 }));
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    void navigator.locks.request('talrum-outbox', () => held);
    const discardDone = discardEntry('01HZZA');
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2), { timeout: 5000 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await listEntries()).toHaveLength(1);
    release();
    await discardDone;
    expect(await listEntries()).toEqual([]);
  });
});

describe('discardEntry', () => {
  it('emits a status refresh so the failed pill drops without another outbox event (#290)', async () => {
    await putEntry(baseEntry({ id: '01HZZA', status: 'failed', attemptCount: 3 }));
    const seen: number[] = [];
    const unsub = subscribeStatus((s) => seen.push(s.failedCount));
    // Surface the "1 failed" state to subscribers up front so the post-discard
    // drop is an observable transition, not just a coincidental end value.
    await refreshStatus();
    expect(seen[seen.length - 1]).toBe(1);
    // No drain, no online/offline event follows — discardEntry must push the
    // updated count itself, or the pill keeps its stale "1 failed".
    await discardEntry('01HZZA');
    unsub();
    expect(seen[seen.length - 1]).toBe(0);
    expect(await listEntries()).toEqual([]);
  });
});

describe('retryFailed', () => {
  it('re-attempts failed entries and clears them on success (#277)', async () => {
    await putEntry(
      baseEntry({ id: '01HZZA', status: 'failed', attemptCount: 3, lastError: 'Failed to fetch' }),
    );
    await retryFailed();
    expect(eqMock).toHaveBeenCalledTimes(1);
    expect(await listEntries()).toEqual([]);
  });

  it('grants a failed entry a fresh retry budget', async () => {
    unguardedSelectMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await putEntry(
      baseEntry({ id: '01HZZA', status: 'failed', attemptCount: 3, lastError: 'Failed to fetch' }),
    );
    await retryFailed();
    const entries = await listEntries();
    expect(entries).toHaveLength(1);
    // Reset to pending with attemptCount restarted — one drain attempt has
    // run since the reset, so the count is 1, not 4.
    expect(entries[0]?.status).toBe('pending');
    expect(entries[0]?.attemptCount).toBe(1);
  });

  it('leaves pending entries untouched when there is nothing failed', async () => {
    setOnline(false); // drain is a no-op offline, so the entry must survive as-is
    await putEntry(baseEntry({ id: '01HZZA', attemptCount: 2 }));
    await retryFailed();
    const entries = await listEntries();
    expect(entries[0]?.attemptCount).toBe(2);
  });
});

describe('conflict guard (#281)', () => {
  const T0 = '2026-06-11T10:00:00.000001+00:00';
  const T1 = '2026-06-11T10:00:01.000001+00:00';
  const T2 = '2026-06-11T10:00:02.000001+00:00';

  it('marks a conflicted entry failed with the conflict message', async () => {
    guardSelectMock.mockResolvedValue({ data: [], error: null });
    await putEntry(baseEntry({ id: '01HZZA', expectedUpdatedAt: T0 }));
    await drain();
    const entries = await listEntries();
    expect(entries[0]?.status).toBe('failed');
    expect(entries[0]?.lastError).toBe(BOARD_CONFLICT_MESSAGE);
  });

  it('persists forwarded baselines so another tab can continue the chain', async () => {
    // A and B were enqueued against the same snapshot. A lands (server clock
    // moves to T1); B fails transiently and stays queued. The forwarded
    // baseline must be in IDB, not just this tab's memory — the tab that
    // picks the queue up later starts with an empty board clock.
    guardSelectMock
      .mockResolvedValueOnce({ data: [{ updated_at: T1 }], error: null })
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await putEntry(baseEntry({ id: '01HZZA', expectedUpdatedAt: T0 }));
    await putEntry(baseEntry({ id: '01HZZB', expectedUpdatedAt: T0 }));
    await drain();
    const [b] = await listEntries();
    expect(b?.id).toBe('01HZZB');
    expect(b?.kind === 'updateBoard' && b.expectedUpdatedAt).toBe(T1);
    // "Another tab": same IDB queue, fresh module state.
    __resetBoardClockForTests();
    guardSelectMock.mockResolvedValueOnce({ data: [{ updated_at: T2 }], error: null });
    await drain();
    expect(matchMock).toHaveBeenLastCalledWith({ id: 'board-1', updated_at: T1 });
    expect(await listEntries()).toEqual([]);
  });

  it('does not forward baselines onto other boards or unguarded entries', async () => {
    guardSelectMock
      .mockResolvedValueOnce({ data: [{ updated_at: T1 }], error: null })
      .mockRejectedValue(new TypeError('Failed to fetch'));
    unguardedSelectMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await putEntry(baseEntry({ id: '01HZZA', expectedUpdatedAt: T0 }));
    await putEntry(baseEntry({ id: '01HZZB', boardId: 'board-2', expectedUpdatedAt: T0 }));
    await putEntry(baseEntry({ id: '01HZZC' }));
    await drain();
    const entries = await listEntries();
    const other = entries.find((e) => e.id === '01HZZB');
    const unguarded = entries.find((e) => e.id === '01HZZC');
    expect(other?.kind === 'updateBoard' && other.expectedUpdatedAt).toBe(T0);
    expect(unguarded?.kind === 'updateBoard' && unguarded.expectedUpdatedAt).toBeUndefined();
  });

  it('fast path: a conflict rejects the mutation without enqueueing', async () => {
    guardSelectMock.mockResolvedValue({ data: [], error: null });
    await expect(
      enqueueAndDrain({
        kind: 'updateBoard',
        boardId: 'b',
        patch: { step_ids: [] },
        expectedUpdatedAt: T0,
      }),
    ).rejects.toMatchObject({ message: BOARD_CONFLICT_MESSAGE });
    expect(await listEntries()).toEqual([]);
  });

  it('retryFailed strips the guard from conflict-failed entries — Retry is an explicit overwrite', async () => {
    await putEntry(
      baseEntry({
        id: '01HZZA',
        status: 'failed',
        attemptCount: 1,
        expectedUpdatedAt: T0,
        lastError: BOARD_CONFLICT_MESSAGE,
      }),
    );
    await retryFailed();
    // Replayed through the unguarded eq path; a kept guard would re-conflict
    // forever, making the Retry button a dead end.
    expect(eqMock).toHaveBeenCalledWith('id', 'board-1');
    expect(matchMock).not.toHaveBeenCalled();
    expect(await listEntries()).toEqual([]);
  });

  it('a guard-stripped retry still feeds the board clock — queued edits do not self-conflict', async () => {
    // A conflict-failed and the user tapped Retry (guard stripped); B was
    // queued meanwhile against the still-stale cached baseline. A's unguarded
    // replay bumps the server clock like any write, so B must guard against
    // the value A produced, not its own T0 — otherwise the device conflicts
    // with itself and the pill cries wolf.
    await putEntry(
      baseEntry({
        id: '01HZZA',
        status: 'failed',
        attemptCount: 1,
        expectedUpdatedAt: T0,
        lastError: BOARD_CONFLICT_MESSAGE,
      }),
    );
    await putEntry(baseEntry({ id: '01HZZB', expectedUpdatedAt: T0 }));
    unguardedSelectMock.mockResolvedValue({ data: [{ updated_at: T1 }], error: null });
    guardSelectMock.mockResolvedValue({ data: [{ updated_at: T2 }], error: null });
    await retryFailed();
    expect(matchMock).toHaveBeenCalledWith({ id: 'board-1', updated_at: T1 });
    expect(await listEntries()).toEqual([]);
  });

  it('reports conflict failures separately in the status feed', async () => {
    // One conflict, one unrelated permanent failure: the pill needs to know
    // a conflict is among them to name it (#281's promised message).
    guardSelectMock.mockResolvedValue({ data: [], error: null });
    unguardedSelectMock.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied', details: '', hint: '' },
    });
    await putEntry(baseEntry({ id: '01HZZA', expectedUpdatedAt: T0 }));
    await putEntry(baseEntry({ id: '01HZZB', boardId: 'board-2' }));
    await drain();
    expect(getStatus().failedCount).toBe(2);
    expect(getStatus().conflictCount).toBe(1);
  });

  it('a fast-path transient failure preserves the guard on the queued entry', async () => {
    guardSelectMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await enqueueAndDrain({
      kind: 'updateBoard',
      boardId: 'board-1',
      patch: { name: 'x' },
      expectedUpdatedAt: T0,
    });
    const [e] = await listEntries();
    expect(e?.kind === 'updateBoard' && e.expectedUpdatedAt).toBe(T0);
  });

  it('retryFailed keeps the guard on entries that failed for other reasons', async () => {
    guardSelectMock.mockResolvedValue({ data: [{ updated_at: T1 }], error: null });
    await putEntry(
      baseEntry({
        id: '01HZZA',
        status: 'failed',
        attemptCount: 3,
        expectedUpdatedAt: T0,
        lastError: 'Failed to fetch',
      }),
    );
    await retryFailed();
    expect(matchMock).toHaveBeenCalledWith({ id: 'board-1', updated_at: T0 });
    expect(eqMock).not.toHaveBeenCalled();
    expect(await listEntries()).toEqual([]);
  });
});

describe('subscribeStatus', () => {
  it('reports queue length + online state to subscribers', async () => {
    setOnline(false);
    const events: number[] = [];
    const unsub = subscribeStatus((s) => events.push(s.pendingCount));
    await putEntry(baseEntry({ id: '01HZZA' }));
    await drain();
    expect(getStatus().pendingCount).toBe(1);
    expect(getStatus().online).toBe(false);
    unsub();
    expect(events.length).toBeGreaterThan(0);
  });
});

describe('enqueueAndDrain', () => {
  it('online + success: bypasses IDB entirely', async () => {
    await enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } });
    expect(await listEntries()).toEqual([]);
  });

  it('online + non-retryable: rejects without enqueueing', async () => {
    unguardedSelectMock.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'not found', details: '', hint: '' },
    });
    await expect(
      enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } }),
    ).rejects.toThrow();
    expect(await listEntries()).toEqual([]);
  });

  it('online + transient: enqueues and resolves', async () => {
    unguardedSelectMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } });
    const entries = await listEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.attemptCount).toBe(1);
  });

  it('online + pending backlog: enqueues behind the queue instead of jumping it (#279)', async () => {
    // An older write is still queued (e.g. offline backlog). A new online
    // write must not bypass it — the queued entry would replay later and
    // overwrite the newer state on the server.
    await putEntry(baseEntry({ id: '01HZZA', boardId: 'board-old' }));
    await enqueueAndDrain({ kind: 'updateBoard', boardId: 'board-new', patch: { name: 'x' } });
    expect(eqMock.mock.calls).toEqual([
      ['id', 'board-old'],
      ['id', 'board-new'],
    ]);
    expect(await listEntries()).toEqual([]);
  });

  it('online + failed-only backlog: fast path stays available', async () => {
    // drain() skips failed entries, so holding the fast path hostage to them
    // would queue new writes behind a dam that never breaks.
    await putEntry(
      baseEntry({ id: '01HZZA', boardId: 'board-old', status: 'failed', attemptCount: 3 }),
    );
    await enqueueAndDrain({ kind: 'updateBoard', boardId: 'board-new', patch: { name: 'x' } });
    expect(eqMock).toHaveBeenCalledTimes(1);
    expect(eqMock).toHaveBeenCalledWith('id', 'board-new');
    expect((await listEntries()).map((e) => e.id)).toEqual(['01HZZA']);
  });

  it('offline: enqueues without trying the handler', async () => {
    setOnline(false);
    await enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } });
    expect(eqMock).not.toHaveBeenCalled();
    const entries = await listEntries();
    expect(entries).toHaveLength(1);
  });

  it('offline enqueue emits the new pending count to subscribers', async () => {
    setOnline(false);
    const seen: number[] = [];
    const unsub = subscribeStatus((s) => seen.push(s.pendingCount));
    await enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } });
    unsub();
    // First push is the initial status (0); second is post-enqueue (1).
    expect(seen[seen.length - 1]).toBe(1);
  });
});

describe('startOutbox', () => {
  it('primes lastStatus from IDB so cold-boot subscribers see real counts (#29)', async () => {
    setOnline(false); // drain is offline-noop; emit() is the only source updating lastStatus.
    await putEntry(baseEntry({ id: '01HZZP' }));
    await putEntry(baseEntry({ id: '01HZZQ' }));
    const seen: number[] = [];
    startOutbox();
    const unsub = subscribeStatus((s) => seen.push(s.pendingCount));
    // emit() does an IDB roundtrip (listEntries) before pushing to subscribers,
    // then drain()'s offline branch emits again. Counting macrotask ticks
    // flakes under load (#87) — poll the actual condition instead.
    await vi.waitFor(() => expect(seen).toContain(2));
    unsub();
  });
});
