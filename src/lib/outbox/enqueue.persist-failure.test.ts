import { clear } from 'idb-keyval';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as StoreModule from './store';

/**
 * The IDB bookkeeping around a fast-path write is best effort: it must never
 * decide the outcome (#446 review). Proving that needs `putEntry`/
 * `deleteEntry` to fail on demand, so `./store` is mocked here and this lives
 * in its own file — outbox.test.ts uses the real store throughout.
 *
 * Both mocks run the real implementation by default, so every test that does
 * not force a failure still reads and writes a real fake-indexeddb store.
 */
const putEntryMock = vi.fn<(entry: never) => Promise<void>>();
const deleteEntryMock = vi.fn<(id: string) => Promise<void>>();

vi.mock('./store', async (importOriginal) => {
  const actual = await importOriginal<typeof StoreModule>();
  return { ...actual, putEntry: putEntryMock, deleteEntry: deleteEntryMock };
});

const selectMock = vi.fn<() => Promise<{ data: unknown; error: null }>>();
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

  // A failed delete is not a failed handler. Classifying it as one replayed a
  // write the server had accepted and put the IndexedDB error text in the
  // entry's lastError (#446 review).
  it('does not treat a failed delete as a failed write', async () => {
    deleteEntryMock.mockRejectedValue(new DOMException('Closed', 'InvalidStateError'));

    await expect(
      enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } }),
    ).resolves.toBeUndefined();

    // The handler ran once. A transient re-queue would replay it.
    expect(eqMock).toHaveBeenCalledTimes(1);
    // The entry the fast path wrote is still there, with no attempt burned
    // and no IDB error text as its lastError. A drain replays it, and
    // handlers are idempotent for exactly this.
    const [left] = await listEntries();
    expect(left?.attemptCount).toBe(0);
    expect(left?.lastError).toBeUndefined();
    expect(captureExceptionMock).toHaveBeenCalledWith(
      expect.any(DOMException),
      expect.objectContaining({ tags: { component: 'outbox', op: 'delete-after-landing' } }),
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

    expect(await listEntries()).toHaveLength(1);
    expect(captureExceptionMock).toHaveBeenCalledWith(
      expect.any(DOMException),
      expect.objectContaining({ tags: { component: 'outbox', op: 'record-transient-attempt' } }),
    );
  });

  // Both puts failed, so nothing is queued. Resolving here would report the
  // write as saved while it vanished — the silent loss #445 is about.
  it('rejects a transient write when no put lands, rather than claiming it is queued', async () => {
    selectMock.mockRejectedValue(new TypeError('Failed to fetch'));
    putEntryMock.mockRejectedValue(new DOMException('Quota', 'QuotaExceededError'));

    await expect(
      enqueueAndDrain({ kind: 'updateBoard', boardId: 'b', patch: { name: 'x' } }),
    ).rejects.toThrow(DOMException);

    expect(await listEntries()).toEqual([]);
  });
});
