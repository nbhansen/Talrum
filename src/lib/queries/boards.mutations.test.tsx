import { onlineManager, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Board } from '@/types/domain';

interface MockPostgrestError {
  code: string;
  message: string;
  details: string;
  hint: string;
}
interface UpdateSelectResult {
  data: { updated_at: string }[] | null;
  error: MockPostgrestError | null;
}
const guardSelectMock = vi.fn<(cols: string) => Promise<UpdateSelectResult>>();
const unguardedSelectMock = vi.fn<(cols: string) => Promise<UpdateSelectResult>>();
// Unguarded chain: `.update().eq('id', ...).select('updated_at')`. eqMock
// stays a spy on the (column, value) pair; the select call is the terminal.
const eqMock = vi.fn((_c: string, _v: string) => ({ select: unguardedSelectMock }));
const matchMock = vi.fn((_filter: Record<string, string>) => ({ select: guardSelectMock }));
const updateMock = vi.fn(() => ({ eq: eqMock, match: matchMock }));
const deleteEqMock =
  vi.fn<(c: string, v: string) => Promise<{ error: MockPostgrestError | null }>>();
const deleteMock = vi.fn(() => ({ eq: deleteEqMock }));
const fromMock = vi.fn((_table: string) => ({ update: updateMock, delete: deleteMock }));

vi.mock('@/lib/supabase', () => ({ supabase: { from: (table: string) => fromMock(table) } }));
vi.mock('@/lib/platform/telemetry', () => ({ captureException: vi.fn() }));

// Import after the mock is registered.
const { boardQueryKey, boardsQueryKey } = await import('./boards.read');
const { boardMembersQueryKey } = await import('./board-members');
const { useDeleteBoard, useUpdateBoard } = await import('./boards.mutations');
const { clearLastBoard, getLastBoardId, setLastBoardId } = await import('@/lib/lastBoard');
const { captureException } = await import('@/lib/platform/telemetry');
const { queryClient: appQueryClient } = await import('@/lib/queryClient');
const { onQueueFlushed, setOutboxOwner, useOutboxStatus } = await import('@/lib/outbox');
const { drain } = await import('@/lib/outbox/drain');
const { putEntry } = await import('@/lib/outbox/store');

const seed: Board = {
  id: 'morning',
  ownerId: 'owner-uuid',
  kidId: 'liam',
  name: 'Morning routine',
  kind: 'sequence',
  labelsVisible: true,
  voiceMode: 'tts',
  stepIds: ['wakeup'],
  kidReorderable: false,
  accent: 'peach',
};

const appendB = {
  boardId: 'morning',
  update: (b: Board) => ({ stepIds: [...b.stepIds, 'b'] }),
};

const makeWrapper = (qc: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

describe('useUpdateBoard', () => {
  beforeEach(() => {
    eqMock.mockClear();
    unguardedSelectMock.mockReset();
    unguardedSelectMock.mockResolvedValue({
      data: [{ updated_at: '2026-06-11T09:00:00.000001+00:00' }],
      error: null,
    });
    updateMock.mockClear();
    fromMock.mockClear();
  });

  it('applies an optimistic cache patch before the DB responds', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(boardQueryKey('morning'), seed);

    // Block the mutation so we can observe the optimistic state.
    let resolveEq: (v: UpdateSelectResult) => void = () => {
      throw new Error('resolver not assigned');
    };
    unguardedSelectMock.mockReturnValue(new Promise((r) => (resolveEq = r)));

    const { result } = renderHook(() => useUpdateBoard(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({ boardId: 'morning', update: () => ({ name: 'Sunrise' }) });
    });

    await waitFor(() => {
      expect(qc.getQueryData<Board>(boardQueryKey('morning'))?.name).toBe('Sunrise');
    });

    resolveEq({ data: [{ updated_at: '2026-06-11T09:00:00.000001+00:00' }], error: null });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('rolls back the cache on a non-retryable DB error (RLS denial)', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(boardQueryKey('morning'), seed);

    // The outbox classifies coded errors (Postgres / PostgREST) as
    // permanent — that's the path that triggers React Query's onError,
    // which rolls the optimistic patch back. A plain TypeError without
    // a code would instead enqueue silently.
    unguardedSelectMock.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'row-level-security', details: '', hint: '' },
    });

    const { result } = renderHook(() => useUpdateBoard(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({ boardId: 'morning', update: () => ({ name: 'Sunrise' }) });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData<Board>(boardQueryKey('morning'))?.name).toBe('Morning routine');
  });
  it('queues an offline edit in the outbox under the app mutation defaults (#756)', async () => {
    const qc = new QueryClient({
      defaultOptions: { ...appQueryClient.getDefaultOptions(), queries: { retry: false } },
    });
    qc.setQueryData(boardQueryKey('morning'), seed);
    const { result } = renderHook(() => ({ update: useUpdateBoard(), outbox: useOutboxStatus() }), {
      wrapper: makeWrapper(qc),
    });
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    onlineManager.setOnline(false);
    try {
      act(() => {
        result.current.update.mutate({ boardId: 'morning', update: () => ({ name: 'Sunrise' }) });
      });
      await waitFor(() => expect(result.current.update.isSuccess).toBe(true));
      expect(qc.getQueryData<Board>(boardQueryKey('morning'))?.name).toBe('Sunrise');
      await waitFor(() => expect(result.current.outbox.pendingCount).toBe(1));
      expect(updateMock).not.toHaveBeenCalled();
    } finally {
      onlineManager.setOnline(true);
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    }
  });

  it('keeps a queued edit on screen until the queue sends it (#773)', async () => {
    const qc = new QueryClient({
      defaultOptions: { ...appQueryClient.getDefaultOptions(), queries: { retry: false } },
    });
    let serverName = seed.name;
    let failingBoard: string | null = 'b';
    const fetchBoard = vi.fn(() => Promise.resolve({ ...seed, name: serverName }));
    qc.setQueryData(boardQueryKey('morning'), seed);
    const stopRefetch = onQueueFlushed(() => void qc.invalidateQueries());
    for (const [id, boardId] of [
      ['00000000000000000000000001', 'a'],
      ['00000000000000000000000002', 'b'],
    ] as const) {
      await putEntry({
        kind: 'updateBoard',
        boardId,
        patch: { name: 'Older edit' },
        id,
        enqueuedAt: 0,
        attemptCount: 0,
        status: 'pending',
        enqueuedBy: 'owner-uuid',
      });
    }
    unguardedSelectMock.mockImplementation(() => {
      const boardId = eqMock.mock.lastCall?.[1];
      if (boardId === failingBoard) {
        return Promise.resolve({
          data: null,
          error: { code: '', message: 'TypeError: Failed to fetch', details: '', hint: '' },
        });
      }
      if (boardId === 'morning') serverName = 'Sunrise';
      return Promise.resolve({
        data: [{ updated_at: '2026-06-11T09:00:00.000001+00:00' }],
        error: null,
      });
    });
    const { result } = renderHook(
      () => ({
        update: useUpdateBoard(),
        board: useQuery({
          queryKey: boardQueryKey('morning'),
          queryFn: fetchBoard,
        }),
      }),
      { wrapper: makeWrapper(qc) },
    );
    try {
      act(() => {
        result.current.update.mutate({ boardId: 'morning', update: () => ({ name: 'Sunrise' }) });
      });
      await waitFor(() => expect(result.current.update.isSuccess).toBe(true));
      // The pass sends `a`, then `b` fails and holds the edit in the queue.
      act(() => setOutboxOwner('owner-uuid'));
      await waitFor(() => expect(eqMock.mock.calls.map((c) => c[1])).toContain('b'));
      await waitFor(() => expect(result.current.board.isFetching).toBe(false));
      expect(result.current.board.data?.name).toBe('Sunrise');

      const fetchesBeforeSend = fetchBoard.mock.calls.length;
      failingBoard = null;
      await act(() => drain());
      await waitFor(() => expect(fetchBoard.mock.calls.length).toBeGreaterThan(fetchesBeforeSend));
      expect(result.current.board.data?.name).toBe('Sunrise');
    } finally {
      stopRefetch();
      setOutboxOwner(null);
    }
  });

  it('writes only the columns the update returns', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(boardQueryKey('morning'), seed);
    const { result } = renderHook(() => useUpdateBoard(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({
        boardId: 'morning',
        update: () => ({ voiceMode: 'parent', kidReorderable: true }),
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(updateMock).toHaveBeenCalledWith({ voice_mode: 'parent', kid_reorderable: true });
  });
});

describe('useUpdateBoard conflict baseline (#281)', () => {
  beforeEach(() => {
    eqMock.mockClear();
    unguardedSelectMock.mockReset();
    unguardedSelectMock.mockResolvedValue({
      data: [{ updated_at: '2026-06-11T09:00:00.000001+00:00' }],
      error: null,
    });
    guardSelectMock.mockReset();
    matchMock.mockClear();
    updateMock.mockClear();
    fromMock.mockClear();
  });

  it('guards the update with the cached serverUpdatedAt', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(boardQueryKey('morning'), {
      ...seed,
      serverUpdatedAt: '2026-06-11T10:00:00.000001+00:00',
    });
    guardSelectMock.mockResolvedValueOnce({
      data: [{ updated_at: '2026-06-11T10:00:01.000001+00:00' }],
      error: null,
    });

    const { result } = renderHook(() => useUpdateBoard(), { wrapper: makeWrapper(qc) });
    act(() => {
      result.current.mutate({ boardId: 'morning', update: () => ({ name: 'Sunrise' }) });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(matchMock).toHaveBeenCalledWith({
      id: 'morning',
      updated_at: '2026-06-11T10:00:00.000001+00:00',
    });
    expect(eqMock).not.toHaveBeenCalled();
  });

  it('stays unguarded when the cached board predates serverUpdatedAt', async () => {
    // Boards rehydrated from a query cache persisted before #281 have no
    // baseline; their writes must keep the plain last-write-wins path.
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(boardQueryKey('morning'), seed);

    const { result } = renderHook(() => useUpdateBoard(), { wrapper: makeWrapper(qc) });
    act(() => {
      result.current.mutate({ boardId: 'morning', update: () => ({ name: 'Sunrise' }) });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(eqMock).toHaveBeenCalledWith('id', 'morning');
    expect(matchMock).not.toHaveBeenCalled();
  });
});

describe('useUpdateBoard updater', () => {
  beforeEach(() => {
    eqMock.mockClear();
    unguardedSelectMock.mockReset();
    unguardedSelectMock.mockResolvedValue({
      data: [{ updated_at: '2026-06-11T09:00:00.000001+00:00' }],
      error: null,
    });
    updateMock.mockClear();
    fromMock.mockClear();
  });

  // Regression for #80: a pre-computed `stepIds` let callers close over
  // render-time state, which clobbered the cache when a drain or a long-open
  // picker shifted it. The updater form reads inside `mutate()` instead.
  it('applies the updater against fresh cache state, not a stale snapshot', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(boardQueryKey('morning'), { ...seed, stepIds: ['a'] });

    const { result } = renderHook(() => useUpdateBoard(), { wrapper: makeWrapper(qc) });

    // Simulate a concurrent edit landing in the cache *after* render but
    // *before* the mutate call (e.g. another tab pushed an append).
    qc.setQueryData(boardQueryKey('morning'), { ...seed, stepIds: ['a', 'b'] });

    act(() => {
      result.current.mutate({
        boardId: 'morning',
        update: (b) => ({ stepIds: [...b.stepIds, 'c'] }),
      });
    });

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    expect(updateMock).toHaveBeenCalledWith({ step_ids: ['a', 'b', 'c'] });
  });

  it('reports a cache miss to telemetry instead of dropping the write silently (#365)', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useUpdateBoard(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate(appendB);
    });

    await waitFor(() => expect(captureException).toHaveBeenCalledTimes(1));
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('exposes isError to the caller after a non-retryable DB error', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(boardQueryKey('morning'), { ...seed, stepIds: ['a'] });

    unguardedSelectMock.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'row-level-security', details: '', hint: '' },
    });

    const { result } = renderHook(() => useUpdateBoard(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate(appendB);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('a retry with the same input re-derives against fresh cache', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(boardQueryKey('morning'), { ...seed, stepIds: ['a'] });

    // First attempt fails (RLS), second succeeds (beforeEach default).
    // Between the two, the cache has shifted — retry must re-merge against
    // the new state, not replay the original computed array.
    unguardedSelectMock.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'row-level-security', details: '', hint: '' },
    });

    const { result } = renderHook(() => useUpdateBoard(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate(appendB);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    // Concurrent edit lands before retry.
    qc.setQueryData(boardQueryKey('morning'), { ...seed, stepIds: ['a', 'x'] });

    act(() => {
      result.current.mutate(appendB);
    });

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(2));
    expect(updateMock).toHaveBeenLastCalledWith({ step_ids: ['a', 'x', 'b'] });
  });

  it('reset() clears the error state', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(boardQueryKey('morning'), { ...seed, stepIds: ['a'] });

    unguardedSelectMock.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'row-level-security', details: '', hint: '' },
    });

    const { result } = renderHook(() => useUpdateBoard(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate(appendB);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    act(() => {
      result.current.reset();
    });
    await waitFor(() => expect(result.current.isError).toBe(false));
  });
});

describe('useDeleteBoard (#520)', () => {
  const other: Board = { ...seed, id: 'bedtime', name: 'Bedtime' };
  const rlsError: MockPostgrestError = {
    code: '42501',
    message: 'row-level-security',
    details: '',
    hint: '',
  };

  beforeEach(() => {
    deleteEqMock.mockReset();
    deleteMock.mockClear();
    fromMock.mockClear();
    clearLastBoard();
  });

  it('optimistically removes the board from the list, then drops the per-board and members caches on settle', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(boardsQueryKey, [seed, other]);
    qc.setQueryData(boardQueryKey('morning'), seed);
    qc.setQueryData(boardMembersQueryKey('morning'), []);
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    let resolveEq: (v: { error: MockPostgrestError | null }) => void = () => {
      throw new Error('resolver not assigned');
    };
    deleteEqMock.mockReturnValue(new Promise((r) => (resolveEq = r)));

    const { result } = renderHook(() => useDeleteBoard(), { wrapper: makeWrapper(qc) });
    act(() => {
      result.current.mutate({ boardId: 'morning' });
    });

    await waitFor(() => {
      expect(qc.getQueryData<Board[]>(boardsQueryKey)?.map((b) => b.id)).toEqual(['bedtime']);
    });
    // The builder still observes the per-board key mid-flight; it goes on settle.
    expect(qc.getQueryData(boardQueryKey('morning'))).toEqual(seed);

    resolveEq({ error: null });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryData(boardQueryKey('morning'))).toBeUndefined();
    expect(qc.getQueryData(boardMembersQueryKey('morning'))).toBeUndefined();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: boardsQueryKey });
  });

  it('rolls back the list on a non-retryable DB error and keeps the per-board cache', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(boardsQueryKey, [seed, other]);
    qc.setQueryData(boardQueryKey('morning'), seed);
    deleteEqMock.mockResolvedValueOnce({ error: rlsError });

    const { result } = renderHook(() => useDeleteBoard(), { wrapper: makeWrapper(qc) });
    act(() => {
      result.current.mutate({ boardId: 'morning' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData<Board[]>(boardsQueryKey)?.map((b) => b.id)).toEqual([
      'morning',
      'bedtime',
    ]);
    // The board still exists; its per-board cache must survive the failure.
    expect(qc.getQueryData(boardQueryKey('morning'))).toEqual(seed);
  });

  it('clears the last-board pointer only when it points at the deleted board', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(boardsQueryKey, [seed, other]);
    deleteEqMock.mockResolvedValue({ error: null });
    setLastBoardId('bedtime');

    const { result } = renderHook(() => useDeleteBoard(), { wrapper: makeWrapper(qc) });
    act(() => {
      result.current.mutate({ boardId: 'morning' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getLastBoardId()).toBe('bedtime');

    act(() => {
      result.current.mutate({ boardId: 'bedtime' });
    });
    await waitFor(() => expect(getLastBoardId()).toBeNull());
  });
});
