import { clear, keys } from 'idb-keyval';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { UpdateBoardEntry } from './types';

interface MockPostgrestError {
  code: string;
  message: string;
  details: string;
  hint: string;
}
const eqMock = vi.fn<(c: string, v: string) => Promise<{ error: MockPostgrestError | null }>>();
const updateMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn((_table: string) => ({ update: updateMock }));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (table: string) => fromMock(table) },
}));

const { deleteEntry, listEntries, putEntry } = await import('./store');
const { __test_resetOutbox, drain, getStatus, startOutbox, subscribeStatus } =
  await import('./drain');
const { enqueueAndDrain } = await import('./index');

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
  eqMock.mockReset();
  // Default: handler succeeds.
  eqMock.mockResolvedValue({ error: null });
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
    eqMock.mockRejectedValue(new TypeError('Failed to fetch'));
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
    eqMock.mockResolvedValue({
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
    eqMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue({ error: null });
    await putEntry(baseEntry({ id: '01HZZA' }));
    await putEntry(baseEntry({ id: '01HZZB' }));
    await drain();
    // The second entry was never attempted because the first stayed pending.
    expect(eqMock).toHaveBeenCalledTimes(1);
    const remaining = await listEntries();
    expect(remaining.map((e) => e.id)).toEqual(['01HZZA', '01HZZB']);
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
    eqMock.mockResolvedValue({ error: null });
    await enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } });
    expect(await listEntries()).toEqual([]);
  });

  it('online + non-retryable: rejects without enqueueing', async () => {
    eqMock.mockResolvedValue({
      error: { code: 'PGRST116', message: 'not found', details: '', hint: '' },
    });
    await expect(
      enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } }),
    ).rejects.toThrow();
    expect(await listEntries()).toEqual([]);
  });

  it('online + transient: enqueues and resolves', async () => {
    eqMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } });
    const entries = await listEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.attemptCount).toBe(1);
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
  beforeEach(() => {
    // startOutbox is one-shot in production (window listeners must not
    // register twice). Reset module state so each test in this block exercises
    // the cold-boot prime path on its own terms.
    __test_resetOutbox();
  });

  it('primes lastStatus from IDB so cold-boot subscribers see real counts (#29)', async () => {
    setOnline(false); // drain is offline-noop; emit() is the only source updating lastStatus.
    await putEntry(baseEntry({ id: '01HZZP' }));
    await putEntry(baseEntry({ id: '01HZZQ' }));
    const seen: number[] = [];
    startOutbox();
    const unsub = subscribeStatus((s) => seen.push(s.pendingCount));
    // Two macrotask ticks: one for emit()'s listEntries, one for the
    // offline-branch emit() inside drain().
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    unsub();
    expect(seen).toContain(2);
  });
});
