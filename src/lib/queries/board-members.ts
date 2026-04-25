import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/supabase';

type BoardMemberRow = Database['public']['Tables']['board_members']['Row'];

export type BoardMemberRole = 'owner' | 'editor' | 'viewer';

export interface BoardMember {
  boardId: string;
  userId: string;
  role: BoardMemberRole;
}

export const rowToBoardMember = (row: BoardMemberRow): BoardMember => ({
  boardId: row.board_id,
  userId: row.user_id,
  role: row.role as BoardMemberRole,
});

export const boardMembersQueryKey = (boardId: string): readonly ['board-members', string] => [
  'board-members',
  boardId,
];

const fetchBoardMembers = async (boardId: string): Promise<BoardMember[]> => {
  const { data, error } = await supabase
    .from('board_members')
    .select('*')
    .eq('board_id', boardId)
    .order('user_id');
  if (error) throw error;
  return data.map(rowToBoardMember);
};

export const useBoardMembers = (boardId: string): UseQueryResult<BoardMember[]> =>
  useQuery({
    queryKey: boardMembersQueryKey(boardId),
    queryFn: () => fetchBoardMembers(boardId),
    enabled: boardId !== '',
  });
