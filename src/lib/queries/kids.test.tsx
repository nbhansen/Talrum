import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TestSessionProvider } from '@/lib/auth/session.test-utils';
import type { Board, Kid } from '@/types/domain';

interface MockPostgrestError {
  code: string;
  message: string;
  details: string;
  hint: string;
}

// Read-path chain: from('kids').select('*').order('created_at')
const orderMock = vi.fn<() => Promise<{ data: unknown; error: MockPostgrestError | null }>>();
const readSelectMock = vi.fn(() => ({ order: orderMock }));

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

// Import after the mock is registered.
const { kidsQueryKey, setActiveKidId, useCreateKid, useDeleteKid, useKids, useRenameKid } =
  await import('./kids');
const { boardsQueryKey } = await import('./boards.read');

const wrap = (qc: QueryClient): ((p: { children: ReactNode }) => JSX.Element) => {
  const Wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <TestSessionProvider>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </TestSessionProvider>
  );
  return Wrapper;
};

describe('useKids', () => {
  beforeEach(() => {
    orderMock.mockReset();
    readSelectMock.mockClear();
    singleMock.mockReset();
    insertSelectMock.mockClear();
    insertMock.mockClear();
    fromMock.mockClear();
  });

  it('fetches kids and maps rows to the domain shape', async () => {
    orderMock.mockResolvedValueOnce({
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

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useKids(), { wrapper: wrap(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual<Kid[]>([{ id: 'k1', ownerId: 'owner-uuid', name: 'Liam' }]);
    expect(fromMock).toHaveBeenCalledWith('kids');
  });
});

describe('useCreateKid', () => {
  beforeEach(() => {
    orderMock.mockReset();
    readSelectMock.mockClear();
    singleMock.mockReset();
    insertSelectMock.mockClear();
    insertMock.mockClear();
    fromMock.mockClear();
  });

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

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useCreateKid(), { wrapper: wrap(qc) });

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
      error: { code: '42501', message: 'row-level-security', details: '', hint: '' },
    });

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useCreateKid(), { wrapper: wrap(qc) });

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
  {
    id: 'morning',
    ownerId: 'owner-uuid',
    kidId: 'k1',
    name: 'Morning routine',
    kind: 'sequence',
    labelsVisible: true,
    voiceMode: 'tts',
    stepIds: ['wakeup'],
    kidReorderable: false,
    accent: 'peach',
    updatedLabel: 'Edited just now',
  },
  {
    id: 'play',
    ownerId: 'owner-uuid',
    kidId: 'k2',
    name: 'Play time',
    kind: 'choice',
    labelsVisible: true,
    voiceMode: 'tts',
    stepIds: ['swing'],
    kidReorderable: false,
    accent: 'peach',
    updatedLabel: 'Edited just now',
  },
];

// The outbox classifies coded errors (Postgres / PostgREST) as permanent —
// that's the path that triggers React Query's onError, which rolls the
// optimistic patch back. A plain TypeError without a code would instead
// enqueue silently.
const rlsError: MockPostgrestError = {
  code: '42501',
  message: 'row-level-security',
  details: '',
  hint: '',
};

const makeClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

describe('useRenameKid', () => {
  beforeEach(() => {
    updateEqMock.mockReset();
    updateMock.mockClear();
    fromMock.mockClear();
  });

  it('applies an optimistic name patch before the DB responds, then invalidates on settle', async () => {
    const qc = makeClient();
    qc.setQueryData(kidsQueryKey, kidSeed());
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    // Block the mutation so we can observe the optimistic state.
    let resolveEq: (v: { error: MockPostgrestError | null }) => void = () => {
      throw new Error('resolver not assigned');
    };
    updateEqMock.mockReturnValue(new Promise((r) => (resolveEq = r)));

    const { result } = renderHook(() => useRenameKid(), { wrapper: wrap(qc) });

    act(() => {
      result.current.mutate({ kidId: 'k1', name: 'Noah' });
    });

    await waitFor(() => {
      expect(qc.getQueryData<Kid[]>(kidsQueryKey)?.find((k) => k.id === 'k1')?.name).toBe('Noah');
    });
    expect(qc.getQueryData<Kid[]>(kidsQueryKey)?.find((k) => k.id === 'k2')?.name).toBe('Mira');

    resolveEq({ error: null });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: kidsQueryKey });
  });

  it('rolls back the cache on a non-retryable DB error (RLS denial)', async () => {
    const qc = makeClient();
    qc.setQueryData(kidsQueryKey, kidSeed());
    updateEqMock.mockResolvedValueOnce({ error: rlsError });

    const { result } = renderHook(() => useRenameKid(), { wrapper: wrap(qc) });

    act(() => {
      result.current.mutate({ kidId: 'k1', name: 'Noah' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData<Kid[]>(kidsQueryKey)).toEqual(kidSeed());
  });
});

describe('useDeleteKid', () => {
  beforeEach(() => {
    deleteEqMock.mockReset();
    deleteMock.mockClear();
    fromMock.mockClear();
    setActiveKidId(null);
  });

  it("optimistically removes the kid and the kid's boards, then invalidates both caches", async () => {
    const qc = makeClient();
    qc.setQueryData(kidsQueryKey, kidSeed());
    qc.setQueryData(boardsQueryKey, boardSeed());
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    let resolveEq: (v: { error: MockPostgrestError | null }) => void = () => {
      throw new Error('resolver not assigned');
    };
    deleteEqMock.mockReturnValue(new Promise((r) => (resolveEq = r)));

    const { result } = renderHook(() => useDeleteKid(), { wrapper: wrap(qc) });

    act(() => {
      result.current.mutate({ kidId: 'k1' });
    });

    await waitFor(() => {
      expect(qc.getQueryData<Kid[]>(kidsQueryKey)?.map((k) => k.id)).toEqual(['k2']);
    });
    // Only the deleted kid's boards leave the cache.
    expect(qc.getQueryData<Board[]>(boardsQueryKey)?.map((b) => b.id)).toEqual(['play']);

    resolveEq({ error: null });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: kidsQueryKey });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: boardsQueryKey });
  });

  it('rolls back both caches on a non-retryable DB error', async () => {
    const qc = makeClient();
    qc.setQueryData(kidsQueryKey, kidSeed());
    qc.setQueryData(boardsQueryKey, boardSeed());
    deleteEqMock.mockResolvedValueOnce({ error: rlsError });

    const { result } = renderHook(() => useDeleteKid(), { wrapper: wrap(qc) });

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
    const { result } = renderHook(() => useDeleteKid(), { wrapper: wrap(qc) });
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
