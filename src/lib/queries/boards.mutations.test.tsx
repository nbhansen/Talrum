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
const eqMock =
  vi.fn<(column: string, value: string) => Promise<{ error: MockPostgrestError | null }>>();
const updateMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn((_table: string) => ({ update: updateMock }));

vi.mock('@/lib/supabase', () => ({ supabase: { from: (table: string) => fromMock(table) } }));

// Import after the mock is registered.
const { boardQueryKey, useRenameBoard, useSetStepIds } = await import('./boards');

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
  accentInk: 'peach-ink',
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
    eqMock.mockReset();
    updateMock.mockClear();
    fromMock.mockClear();
  });

  it('applies an optimistic cache patch before the DB responds', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(boardQueryKey('morning'), seed);

    // Block the mutation so we can observe the optimistic state.
    let resolveEq: (v: { error: null }) => void = () => {
      throw new Error('resolver not assigned');
    };
    eqMock.mockReturnValue(new Promise((r) => (resolveEq = r)));

    const { result } = renderHook(() => useRenameBoard(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({ boardId: 'morning', name: 'Sunrise' });
    });

    await waitFor(() => {
      expect(qc.getQueryData<Board>(boardQueryKey('morning'))?.name).toBe('Sunrise');
    });

    resolveEq({ error: null });
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
    eqMock.mockResolvedValueOnce({
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

describe('useSetStepIds', () => {
  beforeEach(() => {
    eqMock.mockReset();
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

    eqMock.mockResolvedValueOnce({ error: null });

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

    eqMock.mockResolvedValueOnce({
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

    // First attempt fails (RLS), second succeeds. Between the two, the
    // cache has shifted — retry must re-merge against the new state, not
    // replay the original computed array.
    eqMock
      .mockResolvedValueOnce({
        error: { code: '42501', message: 'row-level-security', details: '', hint: '' },
      })
      .mockResolvedValueOnce({ error: null });

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

    eqMock.mockResolvedValueOnce({
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
