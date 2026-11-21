import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Board, Kid } from '@/types/domain';

import {
  deferred,
  makeBoard,
  makeClient,
  makeWrapper,
  type MockPostgrestError,
  rlsError,
} from './queries.test-utils';

// Read-path chain: from('kids').select('*')[.gt('id', after)].order('id').limit(n)
const limitMock = vi.fn<() => Promise<{ data: unknown; error: MockPostgrestError | null }>>();
const pageQuery = { gt: vi.fn(() => pageQuery), order: vi.fn(() => ({ limit: limitMock })) };
const readSelectMock = vi.fn(() => pageQuery);

// Write-path chain: from('kids').insert({...}).select().single()
const singleMock = vi.fn<() => Promise<{ data: unknown; error: MockPostgrestError | null }>>();
const insertSelectMock = vi.fn(() => ({ single: singleMock }));
const insertMock = vi.fn(() => ({ select: insertSelectMock }));

// Outbox-handler chains: from('kids').update({name}).eq('id', ...) and
// from('kids').delete().eq('id', ...) — the eq call is the awaited terminal.
const updateEqMock =
  vi.fn<(col: string, val: string) => Promise<{ error: MockPostgrestError | null }>>();
const updateMock = vi.fn(() => ({ eq: updateEqMock }));
const deleteEqMock =
  vi.fn<(col: string, val: string) => Promise<{ error: MockPostgrestError | null }>>();
const deleteMock = vi.fn(() => ({ eq: deleteEqMock }));

const fromMock = vi.fn((_table: string) => ({
  select: readSelectMock,
  insert: insertMock,
  update: updateMock,
  delete: deleteMock,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (table: string) => fromMock(table) },
}));

vi.mock('@/lib/platform/telemetry', () => ({ captureException: vi.fn() }));

// Import after the mock is registered.
const { kidsQueryKey, useCreateKid, useDeleteKid, useKids, useRenameKid } = await import('./kids');
const { setActiveKidId } = await import('@/lib/activeKid');
const { boardsQueryKey } = await import('./boards.read');

beforeEach(() => {
  limitMock.mockReset();
  readSelectMock.mockClear();
  singleMock.mockReset();
  insertSelectMock.mockClear();
  insertMock.mockClear();
  updateEqMock.mockReset();
  updateMock.mockClear();
  deleteEqMock.mockReset();
  deleteMock.mockClear();
  fromMock.mockClear();
});

describe('useKids', () => {
  it('fetches kids and maps rows to the domain shape', async () => {
    limitMock.mockResolvedValueOnce({
      data: [
        {
          id: 'k1',
          owner_id: 'owner-uuid',
          name: 'Liam',
          created_at: '2026-04-01T00:00:00Z',
        },
      ],
      error: null,
    });

    const qc = makeClient();
    const { result } = renderHook(() => useKids(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual<Kid[]>([{ id: 'k1', ownerId: 'owner-uuid', name: 'Liam' }]);
    expect(fromMock).toHaveBeenCalledWith('kids');
  });

  it('reads past a full page and sorts all rows by created_at', async () => {
    const shared = Array.from({ length: 1000 }, (_, i) => ({
      id: `s${String(i).padStart(4, '0')}`,
      owner_id: 'sharer-uuid',
      name: 'Shared',
      created_at: '2026-05-01T00:00:00Z',
    }));
    const own = {
      id: 'zz',
      owner_id: 'owner-uuid',
      name: 'Own',
      created_at: '1970-01-01T00:00:00Z',
    };
    limitMock
      .mockResolvedValueOnce({ data: shared, error: null })
      .mockResolvedValueOnce({ data: [own], error: null });

    const qc = makeClient();
    const { result } = renderHook(() => useKids(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1001);
    expect(result.current.data?.[0]).toEqual<Kid>({ id: 'zz', ownerId: 'owner-uuid', name: 'Own' });
  });
});

describe('useCreateKid', () => {
  it('inserts with the supplied name + session owner_id, returns the mapped Kid, and invalidates the kids list cache', async () => {
    singleMock.mockResolvedValueOnce({
      data: {
        id: 'k-new',
        owner_id: '00000000-0000-0000-0000-0000000000aa',
        name: 'Mira',
        created_at: '2026-04-26T12:00:00Z',
      },
      error: null,
    });

    const qc = makeClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useCreateKid(), { wrapper: makeWrapper(qc) });

    let returned: Kid | undefined;
    await act(async () => {
      // Input normalization (trim) is the modal's job; the query forwards
      // `name` to the DB unchanged.
      returned = await result.current.mutateAsync({ name: 'Mira' });
    });

    expect(returned).toEqual<Kid>({
      id: 'k-new',
      ownerId: '00000000-0000-0000-0000-0000000000aa',
      name: 'Mira',
    });
    expect(insertMock).toHaveBeenCalledWith({
      owner_id: '00000000-0000-0000-0000-0000000000aa',
      name: 'Mira',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: kidsQueryKey });
  });

  it('surfaces a Postgres RLS error as React Query error state', async () => {
    singleMock.mockResolvedValueOnce({
      data: null,
      error: rlsError,
    });

    const qc = makeClient();
    const { result } = renderHook(() => useCreateKid(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({ name: 'Mira' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: '42501' });
  });
});

const kidSeed = (): Kid[] => [
  { id: 'k1', ownerId: 'owner-uuid', name: 'Liam' },
  { id: 'k2', ownerId: 'owner-uuid', name: 'Mira' },
];

const boardSeed = (): Board[] => [
  makeBoard({ id: 'morning', kidId: 'k1' }),
  makeBoard({ id: 'play', kidId: 'k2' }),
];

describe('useRenameKid', () => {
  it('applies an optimistic name patch before the DB responds', async () => {
    const qc = makeClient();
    qc.setQueryData(kidsQueryKey, kidSeed());
    const write = deferred<{ error: MockPostgrestError | null }>();
    updateEqMock.mockReturnValue(write.promise);

    const { result } = renderHook(() => useRenameKid(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({ kidId: 'k1', name: 'Noah' });
    });

    await waitFor(() => {
      expect(qc.getQueryData<Kid[]>(kidsQueryKey)?.find((k) => k.id === 'k1')?.name).toBe('Noah');
    });
    expect(qc.getQueryData<Kid[]>(kidsQueryKey)?.find((k) => k.id === 'k2')?.name).toBe('Mira');

    write.resolve({ error: null });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('rolls back the cache on a non-retryable DB error (RLS denial)', async () => {
    const qc = makeClient();
    qc.setQueryData(kidsQueryKey, kidSeed());
    updateEqMock.mockResolvedValueOnce({ error: rlsError });

    const { result } = renderHook(() => useRenameKid(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({ kidId: 'k1', name: 'Noah' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData<Kid[]>(kidsQueryKey)).toEqual(kidSeed());
  });
});

describe('useDeleteKid', () => {
  it("optimistically removes the kid and the kid's boards", async () => {
    const qc = makeClient();
    qc.setQueryData(kidsQueryKey, kidSeed());
    qc.setQueryData(boardsQueryKey, boardSeed());
    const write = deferred<{ error: MockPostgrestError | null }>();
    deleteEqMock.mockReturnValue(write.promise);

    const { result } = renderHook(() => useDeleteKid(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({ kidId: 'k1' });
    });

    await waitFor(() => {
      expect(qc.getQueryData<Kid[]>(kidsQueryKey)?.map((k) => k.id)).toEqual(['k2']);
    });
    // Only the deleted kid's boards leave the cache.
    expect(qc.getQueryData<Board[]>(boardsQueryKey)?.map((b) => b.id)).toEqual(['play']);

    write.resolve({ error: null });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('rolls back both caches on a non-retryable DB error', async () => {
    const qc = makeClient();
    qc.setQueryData(kidsQueryKey, kidSeed());
    qc.setQueryData(boardsQueryKey, boardSeed());
    deleteEqMock.mockResolvedValueOnce({ error: rlsError });

    const { result } = renderHook(() => useDeleteKid(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({ kidId: 'k1' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData<Kid[]>(kidsQueryKey)).toEqual(kidSeed());
    expect(qc.getQueryData<Board[]>(boardsQueryKey)).toEqual(boardSeed());
  });

  it('clears the stored active-kid id when the deleted kid is active, and keeps it otherwise', async () => {
    const qc = makeClient();
    qc.setQueryData(kidsQueryKey, kidSeed());
    deleteEqMock.mockResolvedValue({ error: null });

    setActiveKidId('k1');
    const { result } = renderHook(() => useDeleteKid(), { wrapper: makeWrapper(qc) });
    await act(async () => {
      await result.current.mutateAsync({ kidId: 'k1' });
    });
    expect(localStorage.getItem('talrum:active-kid-id')).toBeNull();

    setActiveKidId('k2');
    await act(async () => {
      await result.current.mutateAsync({ kidId: 'k1' });
    });
    expect(localStorage.getItem('talrum:active-kid-id')).toBe('k2');
  });
});
