import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/types/supabase';

type Row = Database['public']['Tables']['board_members']['Row'];

const orderMock = vi.fn<() => Promise<{ data: Row[] | null; error: unknown }>>();
const eqMock = vi.fn(() => ({ order: orderMock }));
const selectMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));

vi.mock('@/lib/supabase', () => ({ supabase: { from: () => fromMock() } }));

const { boardMembersQueryKey, rowToBoardMember, useBoardMembers } = await import('./board-members');

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
    eqMock.mockClear();
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
    expect(eqMock).toHaveBeenCalledWith('board_id', 'b1');
  });

  it('is disabled when boardId is empty (no fetch fires)', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useBoardMembers(''), { wrapper: makeWrapper(qc) });
    expect(fromMock).not.toHaveBeenCalled();
  });
});
