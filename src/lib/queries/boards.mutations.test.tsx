import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
const fromMock = vi.fn((_table: string) => ({ update: updateMock }));

vi.mock('@/lib/supabase', () => ({ supabase: { from: (table: string) => fromMock(table) } }));

// Import after the mock is registered.
const { boardQueryKey } = await import('./boards.read');
const { useRenameBoard, useSetStepIds } = await import('./boards.mutations');

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
  updatedLabel: 'Edited just now',
};

const makeWrapper = (qc: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

describe('useRenameBoard (useBoardPatch)', () => {
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

    const { result } = renderHook(() => useRenameBoard(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({ boardId: 'morning', name: 'Sunrise' });
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

    const { result } = renderHook(() => useRenameBoard(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({ boardId: 'morning', name: 'Sunrise' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData<Board>(boardQueryKey('morning'))?.name).toBe('Morning routine');
  });
});

describe('useBoardPatch conflict baseline (#281)', () => {
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

    const { result } = renderHook(() => useRenameBoard(), { wrapper: makeWrapper(qc) });
    act(() => {
      result.current.mutate({ boardId: 'morning', name: 'Sunrise' });
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

    const { result } = renderHook(() => useRenameBoard(), { wrapper: makeWrapper(qc) });
    act(() => {
      result.current.mutate({ boardId: 'morning', name: 'Sunrise' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(eqMock).toHaveBeenCalledWith('id', 'morning');
    expect(matchMock).not.toHaveBeenCalled();
  });
});

describe('useSetStepIds', () => {
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

  // Regression for #80: the prior API took a pre-computed `stepIds: string[]`,
  // which let callers close over render-time `board.stepIds`. If the cache
  // shifted between render and mutate (concurrent edit, outbox drain, long-
  // open picker), the closed-over snapshot would clobber it. The new API
  // takes an updater and reads the cache at the synchronous boundary of
  // `mutate()` so the merge always uses fresh state.
  it('applies the updater against fresh cache state, not a stale snapshot', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(boardQueryKey('morning'), { ...seed, stepIds: ['a'] });

    const { result } = renderHook(() => useSetStepIds(), { wrapper: makeWrapper(qc) });

    // Simulate a concurrent edit landing in the cache *after* render but
    // *before* the mutate call (e.g. another tab pushed an append).
    qc.setQueryData(boardQueryKey('morning'), { ...seed, stepIds: ['a', 'b'] });

    act(() => {
      result.current.mutate({ boardId: 'morning', update: (prev) => [...prev, 'c'] });
    });

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    expect(updateMock).toHaveBeenCalledWith({ step_ids: ['a', 'b', 'c'] });
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

    const { result } = renderHook(() => useSetStepIds(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({ boardId: 'morning', update: (prev) => [...prev, 'b'] });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('retry() re-runs the last input against fresh cache', async () => {
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

    const { result } = renderHook(() => useSetStepIds(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({ boardId: 'morning', update: (prev) => [...prev, 'b'] });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    // Concurrent edit lands before retry.
    qc.setQueryData(boardQueryKey('morning'), { ...seed, stepIds: ['a', 'x'] });

    act(() => {
      result.current.retry();
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

    const { result } = renderHook(() => useSetStepIds(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({ boardId: 'morning', update: (prev) => [...prev, 'b'] });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    act(() => {
      result.current.reset();
    });
    await waitFor(() => expect(result.current.isError).toBe(false));
  });
});
