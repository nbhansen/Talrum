import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/types/supabase';

type Row = Database['public']['Tables']['board_members']['Row'];

// SELECT builder mocks
const orderMock = vi.fn<() => Promise<{ data: Row[] | null; error: unknown }>>();
const selectEqMock = vi.fn(() => ({ order: orderMock }));
const selectMock = vi.fn(() => ({ eq: selectEqMock }));

// INSERT mock
const insertMock = vi.fn<(payload: unknown) => Promise<{ error: unknown }>>();

// DELETE builder mocks: delete().eq().eq() returning a Promise.
const deleteEq2Mock = vi.fn<() => Promise<{ error: unknown }>>();
const deleteEq1Mock = vi.fn(() => ({ eq: deleteEq2Mock }));
const deleteMock = vi.fn(() => ({ eq: deleteEq1Mock }));

const fromMock = vi.fn(() => ({ select: selectMock, insert: insertMock, delete: deleteMock }));

vi.mock('@/lib/supabase', () => ({ supabase: { from: () => fromMock() } }));

const {
  boardMembersQueryKey,
  isAlreadyMemberError,
  isShareForbiddenError,
  rowToBoardMember,
  useAddBoardMember,
  useBoardMembers,
  useRemoveBoardMember,
} = await import('./board-members');

const makeWrapper = (qc: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

describe('rowToBoardMember', () => {
  it('maps snake_case row to camelCase domain shape', () => {
    expect(rowToBoardMember({ board_id: 'b1', user_id: 'u1', role: 'viewer' })).toEqual({
      boardId: 'b1',
      userId: 'u1',
      role: 'viewer',
    });
  });
});

describe('boardMembersQueryKey', () => {
  it('returns a tuple keyed by board id so caches segregate per board', () => {
    expect(boardMembersQueryKey('b1')).toEqual(['board-members', 'b1']);
    expect(boardMembersQueryKey('b2')).toEqual(['board-members', 'b2']);
  });
});

describe('useBoardMembers', () => {
  beforeEach(() => {
    orderMock.mockReset();
    selectEqMock.mockClear();
    selectMock.mockClear();
    fromMock.mockClear();
  });

  it('fetches members for a board and maps rows to domain', async () => {
    orderMock.mockResolvedValueOnce({
      data: [
        { board_id: 'b1', user_id: 'u-alice', role: 'viewer' },
        { board_id: 'b1', user_id: 'u-bob', role: 'editor' },
      ],
      error: null,
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useBoardMembers('b1'), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { boardId: 'b1', userId: 'u-alice', role: 'viewer' },
      { boardId: 'b1', userId: 'u-bob', role: 'editor' },
    ]);
    expect(selectEqMock).toHaveBeenCalledWith('board_id', 'b1');
  });

  it('is disabled when boardId is empty (no fetch fires)', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useBoardMembers(''), { wrapper: makeWrapper(qc) });
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('useAddBoardMember', () => {
  beforeEach(() => {
    insertMock.mockReset();
    fromMock.mockClear();
  });

  it('inserts the row and invalidates the per-board members cache', async () => {
    insertMock.mockResolvedValueOnce({ error: null });
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useAddBoardMember(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({ boardId: 'b1', userId: 'u-bob', role: 'viewer' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(insertMock).toHaveBeenCalledWith({
      board_id: 'b1',
      user_id: 'u-bob',
      role: 'viewer',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: boardMembersQueryKey('b1'),
    });
  });

  it('rejects with the supabase error so callers can branch on .code', async () => {
    insertMock.mockResolvedValueOnce({
      error: { code: '23505', message: 'duplicate key' },
    });
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const { result } = renderHook(() => useAddBoardMember(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({ boardId: 'b1', userId: 'u-bob', role: 'viewer' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(isAlreadyMemberError(result.current.error)).toBe(true);
    expect(isShareForbiddenError(result.current.error)).toBe(false);
  });
});

describe('useRemoveBoardMember', () => {
  beforeEach(() => {
    deleteEq2Mock.mockReset();
    deleteEq1Mock.mockClear();
    deleteMock.mockClear();
    fromMock.mockClear();
  });

  it('deletes the row by composite key and invalidates the cache', async () => {
    deleteEq2Mock.mockResolvedValueOnce({ error: null });
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useRemoveBoardMember(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({ boardId: 'b1', userId: 'u-bob' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(deleteEq1Mock).toHaveBeenCalledWith('board_id', 'b1');
    expect(deleteEq2Mock).toHaveBeenCalledWith('user_id', 'u-bob');
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: boardMembersQueryKey('b1'),
    });
  });
});

describe('error classifiers', () => {
  it('isAlreadyMemberError matches a 23505 unique-violation', () => {
    expect(isAlreadyMemberError({ code: '23505', message: 'dup' })).toBe(true);
    expect(isAlreadyMemberError({ code: '42501', message: 'rls' })).toBe(false);
    expect(isAlreadyMemberError(null)).toBe(false);
    expect(isAlreadyMemberError('not an object')).toBe(false);
  });

  it('isShareForbiddenError matches a 42501 RLS denial', () => {
    expect(isShareForbiddenError({ code: '42501', message: 'rls' })).toBe(true);
    expect(isShareForbiddenError({ code: '23505', message: 'dup' })).toBe(false);
  });
});
