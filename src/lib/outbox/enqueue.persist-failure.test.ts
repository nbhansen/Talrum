import { clear } from 'idb-keyval';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as StoreModule from './store';

/**
 * Proving that IDB bookkeeping never decides a write's outcome (#446) needs
 * `putEntry`/`deleteEntry` to fail on demand, so this file mocks `./store`
 * while outbox.test.ts uses the real one. Both mocks default to the real
 * implementation, so a test that forces no failure still hits fake-indexeddb.
 */
const putEntryMock = vi.fn<(entry: never) => Promise<void>>();
const deleteEntryMock = vi.fn<(id: string) => Promise<void>>();

vi.mock('./store', async (importOriginal) => {
  const actual = await importOriginal<typeof StoreModule>();
  return { ...actual, putEntry: putEntryMock, deleteEntry: deleteEntryMock };
});

interface MockPostgrestError {
  code: string;
  message: string;
  details: string;
  hint: string;
}
const selectMock = vi.fn<() => Promise<{ data: unknown; error: MockPostgrestError | null }>>();
const eqMock = vi.fn((_c: string, _v: string) => ({ select: selectMock }));
const updateMock = vi.fn(() => ({ eq: eqMock }));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (_table: string) => ({ update: updateMock }) },
}));

vi.mock('@/lib/platform/telemetry', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

const realStore = await vi.importActual<typeof StoreModule>('./store');
const { enqueueAndDrain } = await import('./index');
const { getStatus, refreshStatus } = await import('./drain');
const { listEntries } = await import('./store');
const { captureException } = await import('@/lib/platform/telemetry');

const captureExceptionMock = vi.mocked(captureException);

beforeEach(async () => {
  await clear();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  putEntryMock.mockReset().mockImplementation(realStore.putEntry as (e: never) => Promise<void>);
  deleteEntryMock.mockReset().mockImplementation(realStore.deleteEntry);
  eqMock.mockClear();
  captureExceptionMock.mockClear();
  selectMock.mockResolvedValue({
    data: [{ updated_at: '2026-06-11T09:00:00.000001+00:00' }],
    error: null,
  });
});

describe('enqueueAndDrain when IndexedDB cannot be written', () => {
  it('still runs the online write and resolves', async () => {
    putEntryMock.mockRejectedValue(new DOMException('Quota', 'QuotaExceededError'));

    await expect(
      enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } }),
    ).resolves.toBeUndefined();

    // The handler ran. Rejecting here would fail a write the network accepted.
    expect(eqMock).toHaveBeenCalledWith('id', 'b');
    expect(await listEntries()).toEqual([]);
  });

  it('reports the lost durability instead of failing silently', async () => {
    putEntryMock.mockRejectedValue(new DOMException('Quota', 'QuotaExceededError'));

    await enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } });

    expect(captureExceptionMock).toHaveBeenCalledWith(
      expect.any(DOMException),
      expect.objectContaining({ tags: { component: 'outbox', op: 'persist-before-attempt' } }),
    );
  });

  // Classifying a failed delete as a failed handler replayed a write the server
  // had accepted, and put the IndexedDB error in `lastError` (#446).
  it('does not treat a failed delete as a failed write', async () => {
    deleteEntryMock.mockRejectedValue(new DOMException('Closed', 'InvalidStateError'));

    await expect(
      enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } }),
    ).resolves.toBeUndefined();

    expect(captureExceptionMock).toHaveBeenCalledWith(
      expect.any(DOMException),
      expect.objectContaining({ tags: { component: 'outbox', op: 'delete-after-landing' } }),
    );
    // A transient re-queue would have replayed it immediately.
    expect(eqMock).toHaveBeenCalledTimes(1);
    // The entry outlived its write, but as `attempting` — the abandoned-attempt
    // case, which the next lock holder resolves.
    expect((await listEntries())[0]?.status).toBe('attempting');
    // The signature of the bug: the IndexedDB error as `lastError`.
    expect(putEntryMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ lastError: expect.stringContaining('Closed') }),
    );
  });

  // The drain replays the write whether or not the attempt count landed.
  it('keeps a transient write queued when only the retry bookkeeping fails', async () => {
    selectMock.mockRejectedValue(new TypeError('Failed to fetch'));
    putEntryMock.mockImplementationOnce(realStore.putEntry as (e: never) => Promise<void>);
    putEntryMock.mockRejectedValueOnce(new DOMException('Closed', 'InvalidStateError'));

    await expect(
      enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } }),
    ).resolves.toBeUndefined();

    expect(await listEntries()).toHaveLength(1);
    expect(captureExceptionMock).toHaveBeenCalledWith(
      expect.any(DOMException),
      expect.objectContaining({ tags: { component: 'outbox', op: 'record-transient-attempt' } }),
    );
  });

  // As `pending` it would sit in the count for a write the user watched fail.
  it('leaves an uncleared permanent failure out of the count', async () => {
    selectMock.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied', details: '', hint: '' },
    });
    deleteEntryMock.mockRejectedValue(new DOMException('Closed', 'InvalidStateError'));

    await expect(
      enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } }),
    ).rejects.toThrow();

    expect((await listEntries())[0]?.status).toBe('attempting');
    await refreshStatus();
    expect(getStatus().pendingCount).toBe(0);
  });

  // Nothing is queued, so resolving would report a vanished write as saved.
  it('rejects a transient write when no put lands, rather than claiming it is queued', async () => {
    selectMock.mockRejectedValue(new TypeError('Failed to fetch'));
    putEntryMock.mockRejectedValue(new DOMException('Quota', 'QuotaExceededError'));

    await expect(
      enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } }),
    ).rejects.toThrow(DOMException);

    expect(await listEntries()).toEqual([]);
  });
});
