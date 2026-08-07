import { clear } from 'idb-keyval';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as StoreModule from './store';

/**
 * A device that cannot write IndexedDB (quota) must keep making online writes
 * (#446 review). The pre-attempt put added for #445 is best effort, so it
 * needs its own file: `./store` is mocked here, and outbox.test.ts uses the
 * real one.
 */
const putEntryMock = vi.fn<(entry: unknown) => Promise<void>>();

vi.mock('./store', async (importOriginal) => {
  const actual = await importOriginal<typeof StoreModule>();
  return { ...actual, putEntry: putEntryMock };
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

const { enqueueAndDrain } = await import('./index');
const { listEntries } = await import('./store');
const { captureException } = await import('@/lib/platform/telemetry');

const captureExceptionMock = vi.mocked(captureException);

beforeEach(async () => {
  await clear();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  putEntryMock.mockReset();
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
});
