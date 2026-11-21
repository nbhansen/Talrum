import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Board } from '@/types/domain';

import { makeClient, makeWrapper, type MockPostgrestError, rlsError } from './queries.test-utils';

// Write-path chain: from('boards').insert({...}).select().single()
const singleMock = vi.fn<() => Promise<{ data: unknown; error: MockPostgrestError | null }>>();
const insertSelectMock = vi.fn(() => ({ single: singleMock }));
const insertMock = vi.fn(() => ({ select: insertSelectMock }));
const fromMock = vi.fn((_table: string) => ({ insert: insertMock }));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (table: string) => fromMock(table) },
}));

// Import after the mock is registered.
const { boardsQueryKey } = await import('./boards.read');
const { useCreateBoard } = await import('./boards.mutations');

const SERVER_ROW = {
  id: 'b-new',
  owner_id: '00000000-0000-0000-0000-0000000000aa',
  kid_id: 'k1',
  slug: null,
  name: 'Morning routine',
  kind: 'sequence',
  labels_visible: true,
  voice_mode: 'parent',
  step_ids: [] as string[],
  kid_reorderable: false,
  accent: 'sage',
  updated_at: '2026-04-26T12:00:00Z',
};

describe('useCreateBoard', () => {
  beforeEach(() => {
    singleMock.mockReset();
    insertSelectMock.mockClear();
    insertMock.mockClear();
    fromMock.mockClear();
  });

  it('inserts with sensible defaults, returns the mapped Board, and invalidates the boards list cache', async () => {
    singleMock.mockResolvedValueOnce({ data: SERVER_ROW, error: null });

    const qc = makeClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useCreateBoard(), { wrapper: makeWrapper(qc) });

    let returned: Board | undefined;
    await act(async () => {
      returned = await result.current.mutateAsync({
        name: '  Morning routine  ',
        kind: 'sequence',
        kidId: 'k1',
      });
    });

    expect(fromMock).toHaveBeenCalledWith('boards');
    expect(insertMock).toHaveBeenCalledWith({
      owner_id: '00000000-0000-0000-0000-0000000000aa',
      kid_id: 'k1',
      name: 'Morning routine',
      kind: 'sequence',
      labels_visible: true,
      voice_mode: 'parent',
      step_ids: [],
      kid_reorderable: false,
      accent: 'sage',
    });
    expect(returned?.name).toBe('Morning routine');
    expect(returned?.kind).toBe('sequence');
    expect(returned?.kidId).toBe('k1');
    expect(returned?.id).toBe('b-new');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: boardsQueryKey });
  });

  it('honors a caller-supplied accent override', async () => {
    singleMock.mockResolvedValueOnce({
      data: { ...SERVER_ROW, accent: 'lavender' },
      error: null,
    });

    const qc = makeClient();
    const { result } = renderHook(() => useCreateBoard(), { wrapper: makeWrapper(qc) });

    await act(async () => {
      await result.current.mutateAsync({
        name: 'Bedtime',
        kind: 'choice',
        kidId: 'k1',
        accent: 'lavender',
      });
    });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ accent: 'lavender', kind: 'choice' }),
    );
    expect(insertMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ accent_ink: expect.anything() }),
    );
  });

  it('surfaces a Postgres RLS error as React Query error state', async () => {
    singleMock.mockResolvedValueOnce({
      data: null,
      error: rlsError,
    });

    const qc = makeClient();
    const { result } = renderHook(() => useCreateBoard(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({ name: 'X', kind: 'sequence', kidId: 'k1' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: '42501' });
  });
});
