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
const { drain } = await import('./drain');
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

beforeEach(async () => {
  await clear();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  __resetOutboxOwnerForTests();
  setOwnerId('user-a');
  putEntryMock.mockReset().mockImplementation(realStore.putEntry as (e: never) => Promise<void>);
  deleteEntryMock.mockReset().mockImplementation(realStore.deleteEntry);
  eqMock.mockClear();
  updateMock.mockClear();
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

  // The pass re-reads the queue, so an entry that landed but stayed `pending`
  // would come back and replay for as long as the delete keeps failing.
  it('runs each landed entry once even when no delete clears it', async () => {
    await realStore.putEntry(baseEntry({ id: '01HZZA' }));
    await realStore.putEntry(baseEntry({ id: '01HZZB' }));
    deleteEntryMock.mockRejectedValue(closed());

    await drain();

    expect(eqMock).toHaveBeenCalledTimes(2);
  });

  it('drains a later entry after one it could not clear', async () => {
    await realStore.putEntry(baseEntry({ id: '01HZZA' }));
    await realStore.putEntry(baseEntry({ id: '01HZZB', boardId: 'board-2' }));
    deleteEntryMock.mockImplementation(async (id) => {
      if (id === '01HZZA') throw closed();
      await realStore.deleteEntry(id);
    });

    await drain();

    expect(eqMock).toHaveBeenCalledWith('id', 'board-2');
    expect((await listEntries()).map((e) => e.id)).toEqual(['01HZZA']);
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
