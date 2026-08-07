import { clear, keys } from 'idb-keyval';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OutboxStatus } from './drain-state';
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
const { discardEntry, enqueueAndDrain, retryFailed, setOutboxOwner } = await import('./index');
const { BOARD_CONFLICT_MESSAGE, HANDLER_TIMEOUT_MS } = await import('./handlers');
const { drainState } = await import('./drain-state');
const { __resetBoardClockForTests } = await import('./board-clock');
// setOwnerId sets the state without the drain `setOutboxOwner` kicks, which
// would otherwise run in the background of every test.
const { __resetOutboxOwnerForTests, setOwnerId } = await import('./owner');

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
  __resetOutboxOwnerForTests();
  // Every test but the account ones runs as one signed-in user; draining is
  // gated on an owner being known.
  setOwnerId('user-a');
  updateMock.mockClear();
  fromMock.mockClear();
  eqMock.mockClear();
  guardSelectMock.mockReset();
  unguardedSelectMock.mockReset();
  matchMock.mockClear();
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
    for (let i = 0; i < 6; i += 1) await drain();
    const entries = await listEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.status).toBe('failed');
    expect(entries[0]?.attemptCount).toBeGreaterThanOrEqual(6);
    expect(entries[0]?.failureKind).toBe('permanent');
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
    expect(entries[0]?.failureKind).toBe('permanent');
  });

  it('stops on a transient failure so order is preserved across the queue', async () => {
    unguardedSelectMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue({
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

/**
 * One real macrotask round, for tests that fake setTimeout. MessageChannel,
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

describe('transient retry timer (#391)', () => {
  beforeEach(() => {
    // Only the pair the scheduler uses: fake-indexeddb resolves through real
    // setImmediate rounds, and faking those deadlocks every IDB await.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * `advanceTimersByTimeAsync` fires `void drain()` but cannot await it, and the
   * drain settles over real macrotask rounds. Bounded, so a genuine failure
   * still surfaces as the assertion error.
   */
  const waitReal = async (check: () => Promise<void>): Promise<void> => {
    for (let i = 0; ; i++) {
      try {
        await check();
        return;
      } catch (err) {
        if (i >= 1000) throw err;
        await realTick();
      }
    }
  };

  /** Fixed flush for negative assertions ("nothing ran"). */
  const flushReal = async (): Promise<void> => {
    for (let i = 0; i < 50; i++) await realTick();
  };

  it('re-drains automatically after a transient failure while online', async () => {
    unguardedSelectMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue({
      data: [{ updated_at: '2026-06-11T09:00:01.000001+00:00' }],
      error: null,
    });
    await putEntry(baseEntry({ id: '01HZZA' }));
    await drain();
    expect(eqMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(2_000);
    await waitReal(async () => expect(await listEntries()).toEqual([]));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('backs off exponentially and leaves no timer once nothing is pending', async () => {
    unguardedSelectMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await putEntry(baseEntry({ id: '01HZZA' }));
    await drain(); // attempt 1 → transient, next drain in 2 s
    await vi.advanceTimersByTimeAsync(2_000);
    await waitReal(async () => expect((await listEntries())[0]?.attemptCount).toBe(2));
    // The second backoff is 4 s: after only 2 s more, nothing runs.
    await vi.advanceTimersByTimeAsync(2_000);
    await flushReal();
    expect((await listEntries())[0]?.attemptCount).toBe(2);
    await vi.advanceTimersByTimeAsync(2_000);
    await waitReal(async () => expect((await listEntries())[0]?.attemptCount).toBe(3));
    // Remaining schedule: 8 s, 16 s, then capped at 30 s (16 × 2 = 32).
    for (const [delay, attempt] of [
      [8_000, 4],
      [16_000, 5],
      [30_000, 6],
    ] as const) {
      await vi.advanceTimersByTimeAsync(delay);
      await waitReal(async () => expect((await listEntries())[0]?.attemptCount).toBe(attempt));
    }
    // Attempt 6 hits MAX_ATTEMPTS → failed. Failed entries don't reschedule.
    expect((await listEntries())[0]?.status).toBe('failed');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resets the backoff when a pass lands an entry', async () => {
    drainState.retryDelayMs = 16_000; // as if earlier passes walked it up
    unguardedSelectMock
      .mockResolvedValueOnce({
        data: [{ updated_at: '2026-06-11T09:00:01.000001+00:00' }],
        error: null,
      })
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue({
        data: [{ updated_at: '2026-06-11T09:00:02.000001+00:00' }],
        error: null,
      });
    await putEntry(baseEntry({ id: '01HZZA' }));
    await putEntry(baseEntry({ id: '01HZZB' }));
    await drain(); // A lands, B fails transiently → the re-drain comes at 2 s, not 16 s
    expect((await listEntries()).map((e) => e.id)).toEqual(['01HZZB']);
    await vi.advanceTimersByTimeAsync(2_000);
    await waitReal(async () => expect(await listEntries()).toEqual([]));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts the backoff over on a user Retry', async () => {
    drainState.retryDelayMs = 30_000; // as after a long outage
    unguardedSelectMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await putEntry(
      baseEntry({ id: '01HZZA', status: 'failed', attemptCount: 6, failureKind: 'permanent' }),
    );
    await retryFailed(); // attempt 1 → transient; the re-drain must come at 2 s
    expect((await listEntries())[0]?.attemptCount).toBe(1);
    await vi.advanceTimersByTimeAsync(2_000);
    await waitReal(async () => expect((await listEntries())[0]?.attemptCount).toBe(2));
  });

  it('flags timer-driven drains so the indicator label stays steady (#409)', async () => {
    unguardedSelectMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await putEntry(baseEntry({ id: '01HZZA' }));
    const statuses: OutboxStatus[] = [];
    const unsub = subscribeStatus((s) => statuses.push(s));
    try {
      await drain(); // event-driven: this one may say "Syncing…"
      expect(statuses.some((s) => s.draining && !s.timerDrain)).toBe(true);
      statuses.length = 0;
      await vi.advanceTimersByTimeAsync(2_000);
      await waitReal(async () => expect((await listEntries())[0]?.attemptCount).toBe(2));
      // No status from a timer pass may map to "Syncing…": that text change is
      // what re-announces the polite live region on every backoff cycle.
      expect(statuses.length).toBeGreaterThan(0);
      for (const s of statuses) {
        expect(s.draining && !s.timerDrain).toBe(false);
      }
    } finally {
      unsub();
    }
  });

  it('arms no timer when the device drops mid-pass', async () => {
    // The offline listener fires while `draining` is still true and there is no
    // timer to clear, so the finally block must skip the arm itself.
    unguardedSelectMock.mockImplementation(() => {
      setOnline(false);
      return Promise.reject(new TypeError('Failed to fetch'));
    });
    await putEntry(baseEntry({ id: '01HZZA' }));
    await drain();
    expect((await listEntries())[0]?.status).toBe('pending');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the timer when the device goes offline', async () => {
    startOutbox(); // attaches the offline listener
    await flushReal(); // let the boot drain settle (empty queue)
    unguardedSelectMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await putEntry(baseEntry({ id: '01HZZA' }));
    await drain();
    expect(vi.getTimerCount()).toBe(1);
    setOnline(false);
    window.dispatchEvent(new Event('offline'));
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('cross-tab coordination (#278, #289)', () => {
  /**
   * jsdom has no `navigator.locks`, so installing this fake is what opts the
   * drain into its locked path.
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
    // Then give the microtask queue a chance to run handlers anyway.
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

  it('the fast path waits for the talrum-outbox lock held by another tab (#395)', async () => {
    const request = installFakeLocks();
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    // "Another tab" is mid-drain (or mid-fast-path) and holds the lock.
    void navigator.locks.request('talrum-outbox', () => held);
    const done = enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2), { timeout: 5000 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    // An unlocked fast path would already have run the handler here.
    expect(eqMock).not.toHaveBeenCalled();
    release();
    await done;
    expect(eqMock).toHaveBeenCalledTimes(1);
    expect(await listEntries()).toEqual([]);
  });

  it('fast path re-checks onLine after the lock wait so a dead network burns no attempt (#395)', async () => {
    const request = installFakeLocks();
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    void navigator.locks.request('talrum-outbox', () => held);
    const done = enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2), { timeout: 5000 });
    // The network drops while the fast path is parked on the other tab's
    // lock. Running the handler now would spend one of the six retry
    // attempts on a guaranteed failure.
    setOnline(false);
    release();
    await done;
    expect(eqMock).not.toHaveBeenCalled();
    const entries = await listEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.attemptCount).toBe(0);
  });

  it('re-checks the backlog after the lock wait so a queued write is not jumped (#395)', async () => {
    const request = installFakeLocks();
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    void navigator.locks.request('talrum-outbox', () => held);
    const done = enqueueAndDrain({
      kind: 'updateBoard',
      boardId: 'board-new',
      patch: { name: 'x' },
    });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2), { timeout: 5000 });
    // The pre-lock queue observation is stale by the time the lock is granted,
    // and acting on it would jump the queue (#279, cross-tab).
    await putEntry(baseEntry({ id: '01HZZA', boardId: 'board-old' }));
    release();
    await done;
    // The write took the slow path: old entry first, new entry last (FIFO).
    expect(eqMock.mock.calls).toEqual([
      ['id', 'board-old'],
      ['id', 'board-new'],
    ]);
    expect(await listEntries()).toEqual([]);
  });

  it('appends the slow-path entry under the lock, before the next holder runs (#395)', async () => {
    installFakeLocks();
    await putEntry(baseEntry({ id: '01HZZA', boardId: 'board-old' }));
    const done = enqueueAndDrain({
      kind: 'updateBoard',
      boardId: 'board-new',
      patch: { name: 'x' },
    });
    // An append outside the lock would let B observe only the old backlog and
    // fast-path a younger write past this one.
    let observed: string[] = [];
    await navigator.locks.request('talrum-outbox', async () => {
      observed = (await listEntries()).map((e) => e.id);
    });
    expect(observed).toHaveLength(2);
    await done;
    expect(await listEntries()).toEqual([]);
  });

  it('an offline enqueue also appends under the lock (#395)', async () => {
    // online/offline events are per-window, so this tab can be offline while
    // another is mid-fast-path.
    const request = installFakeLocks();
    setOnline(false);
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    void navigator.locks.request('talrum-outbox', () => held);
    const done = enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2), { timeout: 5000 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await listEntries()).toHaveLength(0);
    release();
    await done;
    expect(await listEntries()).toHaveLength(1);
    expect(eqMock).not.toHaveBeenCalled();
  });

  describe('handler IO timeout (#413)', () => {
    beforeEach(() => {
      // Same constraint as the retry-timer block: fake only the pair the
      // timeout uses, or fake-indexeddb deadlocks behind the timer clock.
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('a hung handler times out transient and releases the lock', async () => {
      installFakeLocks();
      await putEntry(baseEntry({ id: '01HZZA' }));
      // A socket stuck open with no bytes: the request never settles, and
      // navigator.onLine still reads true.
      unguardedSelectMock.mockReturnValue(
        new Promise<never>(() => undefined) as ReturnType<typeof unguardedSelectMock>,
      );
      const drainDone = drain();
      // The timeout timer is not armed until the drain reaches the handler over
      // real macrotasks, so advancing the clock earlier fires nothing.
      for (let i = 0; unguardedSelectMock.mock.calls.length === 0; i++) {
        if (i >= 1000) throw new Error('handler never started');
        await realTick();
      }
      await vi.advanceTimersByTimeAsync(HANDLER_TIMEOUT_MS);
      await drainDone;
      // Classified transient: pending with one burned attempt, not failed.
      const entries = await listEntries();
      expect(entries[0]?.status).toBe('pending');
      expect(entries[0]?.attemptCount).toBe(1);
      expect(entries[0]?.lastError).toMatch(/timed out/);
      // The lock is free again — without the timeout this request would park
      // behind the hung drain until the tab died.
      let ran = false;
      await navigator.locks.request('talrum-outbox', () => {
        ran = true;
      });
      expect(ran).toBe(true);
    });
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
    // Makes the post-discard drop an observable transition rather than a
    // coincidental end value.
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
    // One drain attempt has run since the reset, so the count is 1, not 4.
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

  it('marks a conflicted entry failed with the typed kind and the display copy', async () => {
    guardSelectMock.mockResolvedValue({ data: [], error: null });
    await putEntry(baseEntry({ id: '01HZZA', expectedUpdatedAt: T0 }));
    await drain();
    const entries = await listEntries();
    expect(entries[0]?.status).toBe('failed');
    expect(entries[0]?.failureKind).toBe('conflict');
    expect(entries[0]?.lastError).toBe(BOARD_CONFLICT_MESSAGE);
  });

  it('persists forwarded baselines so another tab can continue the chain', async () => {
    // The forwarded baseline must reach IDB, not just this tab's memory: the
    // tab that picks the queue up later starts with an empty board clock.
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
        failureKind: 'conflict',
        // Deliberately not BOARD_CONFLICT_MESSAGE: the strip must key off
        // failureKind, so an edit to the display copy changes nothing (#392).
        lastError: 'any display copy',
      }),
    );
    await retryFailed();
    // A kept guard would re-conflict forever, making Retry a dead end.
    expect(eqMock).toHaveBeenCalledWith('id', 'board-1');
    expect(matchMock).not.toHaveBeenCalled();
    expect(await listEntries()).toEqual([]);
  });

  it('a guard-stripped retry still feeds the board clock — queued edits do not self-conflict', async () => {
    // A was conflict-failed and retried with its guard stripped; B queued
    // meanwhile against the stale baseline. A's replay bumps the server clock,
    // so B must guard against that value or the device conflicts with itself.
    await putEntry(
      baseEntry({
        id: '01HZZA',
        status: 'failed',
        attemptCount: 1,
        expectedUpdatedAt: T0,
        failureKind: 'conflict',
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
    // The pill must know a conflict is among them to name it (#281).
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
        failureKind: 'permanent',
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
  it('online + success: leaves nothing in the queue', async () => {
    await enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } });
    expect(await listEntries()).toEqual([]);
  });

  // The round trip is a window in which the page can go away, and an entry
  // that lived only in memory took the write with it (#445).
  it('online: the entry is durable while the handler is in flight', async () => {
    let landHandler!: () => void;
    unguardedSelectMock.mockReturnValueOnce(
      new Promise((resolve) => {
        landHandler = () =>
          resolve({ data: [{ updated_at: '2026-06-11T09:00:00.000001+00:00' }], error: null });
      }),
    );

    const write = enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } });
    await vi.waitFor(async () => {
      expect(await listEntries()).toHaveLength(1);
    });
    // `attempting`, not `pending`: durable, but not work waiting to be done.
    expect((await listEntries())[0]?.status).toBe('attempting');

    landHandler();
    await write;
    expect(await listEntries()).toEqual([]);
  });

  // As `pending` it counted as a write waiting to sync, so every exit path had
  // to emit a correction afterwards (#446).
  it('online: the in-flight entry is never counted as pending', async () => {
    let landHandler!: () => void;
    unguardedSelectMock.mockReturnValueOnce(
      new Promise((resolve) => {
        landHandler = () =>
          resolve({ data: [{ updated_at: '2026-06-11T09:00:00.000001+00:00' }], error: null });
      }),
    );

    const write = enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } });
    await vi.waitFor(async () => {
      expect(await listEntries()).toHaveLength(1);
    });
    // Any unlocked emitter — the `offline` listener is the one that has no
    // later emitter to correct it.
    await refreshStatus();
    expect(getStatus().pendingCount).toBe(0);

    landHandler();
    await write;
    expect(getStatus().pendingCount).toBe(0);
  });

  // Same window, but the write is rejected. Nothing to correct here either.
  it('online: a permanent failure leaves no count behind', async () => {
    let denyHandler!: () => void;
    unguardedSelectMock.mockReturnValueOnce(
      new Promise((resolve) => {
        denyHandler = () =>
          resolve({
            data: null,
            error: { code: '42501', message: 'permission denied', details: '', hint: '' },
          });
      }),
    );

    const write = enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } });
    await vi.waitFor(async () => {
      expect(await listEntries()).toHaveLength(1);
    });
    await refreshStatus();
    expect(getStatus().pendingCount).toBe(0);

    denyHandler();
    await expect(write).rejects.toThrow();
    expect(getStatus().pendingCount).toBe(0);
    expect(await listEntries()).toEqual([]);
  });

  // The crash recovery #445 is about: the next lock holder knows an
  // `attempting` entry has no owner, because the browser released the lock.
  it('adopts an entry abandoned mid-attempt and replays it', async () => {
    await putEntry(baseEntry({ id: '01HZZA', status: 'attempting' }));

    // Nothing counts it until it is adopted: it is not known to be waiting.
    await refreshStatus();
    expect(getStatus().pendingCount).toBe(0);

    await drain();

    expect(eqMock).toHaveBeenCalledWith('id', 'board-1');
    expect(await listEntries()).toEqual([]);
  });

  // A fast path waiting on the lock acquires it after the sweep releases and
  // writes behind the deletes, so the sweep cannot be the guarantee (#446).
  it('never replays an entry belonging to another account', async () => {
    setOwnerId('user-b');
    await putEntry(baseEntry({ id: '01HZZA', enqueuedBy: 'user-a' }));

    await drain();

    // Not replayed under user B, and the bytes are gone rather than parked.
    expect(eqMock).not.toHaveBeenCalled();
    expect(await listEntries()).toEqual([]);
  });

  // Reading the stamp inside the lock callback would label user A's write with
  // user B, which is why it is read at call time (#446).
  it('abandons a write whose account changed while it waited for the lock', async () => {
    // jsdom has no Web Locks, so stub one that does not grant until told —
    // standing in for the sign-out sweep holding it.
    let grantLock!: () => void;
    const granted = new Promise<void>((r) => {
      grantLock = r;
    });
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: async (_name: string, fn: () => Promise<unknown>) => {
          await granted;
          return fn();
        },
      },
    });

    const write = enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } });
    setOwnerId('user-b');
    grantLock();

    await expect(write).rejects.toThrow(/account changed/i);
    Reflect.deleteProperty(navigator, 'locks');
    // Nothing of user A's is left on the device, and no handler ran for it.
    expect(await listEntries()).toEqual([]);
    expect(eqMock).not.toHaveBeenCalled();
  });

  // startOutbox drains at module load, before AuthGate resolves the session,
  // so without the gate that boot drain replays the previous account (#446).
  it('does not drain until the signed-in account is known, then drains for it', async () => {
    __resetOutboxOwnerForTests();
    await putEntry(baseEntry({ id: '01HZZA', enqueuedBy: 'user-a' }));

    await drain();

    expect(eqMock).not.toHaveBeenCalled();
    expect(await listEntries()).toHaveLength(1);

    // The session resolves as somebody else: the drain it kicks drops the
    // entry rather than replaying it.
    setOutboxOwner('user-b');
    await vi.waitFor(async () => {
      expect(await listEntries()).toEqual([]);
    });
    expect(eqMock).not.toHaveBeenCalled();
  });

  it('keeps an entry written before the owner stamp existed', async () => {
    setOwnerId('user-b');
    // No enqueuedBy: unattributed, not foreign.
    await putEntry(baseEntry({ id: '01HZZA' }));

    await drain();

    expect(eqMock).toHaveBeenCalledWith('id', 'board-1');
    expect(await listEntries()).toEqual([]);
  });

  it('stamps the enqueueing account onto a new entry', async () => {
    unguardedSelectMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } });

    expect((await listEntries())[0]?.enqueuedBy).toBe('user-a');
  });

  // FIFO still holds across the adoption: a new write must not jump an
  // abandoned one (#279's shape).
  it('does not fast-path past an entry abandoned mid-attempt', async () => {
    await putEntry(baseEntry({ id: '01HZZA', boardId: 'board-old', status: 'attempting' }));

    await enqueueAndDrain({ kind: 'updateBoard', boardId: 'board-new', patch: { name: 'x' } });

    expect(eqMock.mock.calls).toEqual([
      ['id', 'board-old'],
      ['id', 'board-new'],
    ]);
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
    // The queued entry would replay later and overwrite the newer state.
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
    // Counting macrotask ticks flakes under load (#87), so poll the condition.
    await vi.waitFor(() => expect(seen).toContain(2));
    unsub();
  });
});
