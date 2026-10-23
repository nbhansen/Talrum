import {
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { useSessionUser } from '@/lib/auth/session';
import { hasPgCode } from '@/lib/hasPgCode';
import { clearLastBoard, getLastBoard } from '@/lib/lastBoard';
import { boardQueryKey, boardsQueryKey } from '@/lib/queries/boards.read';
import { kidsQueryKey } from '@/lib/queries/kids';
import { pictogramsQueryKey } from '@/lib/queries/pictograms.read';
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

// ─── Error classification ───────────────────────────────────────────────────
// Only two codes get friendly copy: the PK collision on a re-invite and the
// RLS rejection when a non-owner shares. Anything else falls through.

export const isAlreadyMemberError = (err: unknown): boolean => hasPgCode(err, '23505');

export const isShareForbiddenError = (err: unknown): boolean => hasPgCode(err, '42501');

// ─── Mutations ──────────────────────────────────────────────────────────────
// Direct writes, no outbox: sharing is rare, and the outbox would defer the
// `is_board_owner` RLS check to drain time. See docs/queries.md.

interface AddBoardMemberInput {
  boardId: string;
  userId: string;
  role: BoardMemberRole;
}

export const useAddBoardMember = (): UseMutationResult<void, Error, AddBoardMemberInput> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ boardId, userId, role }) => {
      const { error } = await supabase
        .from('board_members')
        .insert({ board_id: boardId, user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: (_data, { boardId }) => {
      qc.invalidateQueries({ queryKey: boardMembersQueryKey(boardId) });
    },
  });
};

interface RemoveBoardMemberInput {
  boardId: string;
  userId: string;
}

const removeMember = async ({ boardId, userId }: RemoveBoardMemberInput): Promise<void> => {
  const { error } = await supabase
    .from('board_members')
    .delete()
    .eq('board_id', boardId)
    .eq('user_id', userId);
  if (error) throw error;
};

export const useRemoveBoardMember = (): UseMutationResult<void, Error, RemoveBoardMemberInput> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: removeMember,
    onSuccess: (_data, { boardId }) => {
      qc.invalidateQueries({ queryKey: boardMembersQueryKey(boardId) });
    },
  });
};

/** Leaving can also hide the owner's kids and pictograms, so all three lists refetch. */
export const useLeaveBoard = (): UseMutationResult<void, Error, { boardId: string }> => {
  const qc = useQueryClient();
  const userId = useSessionUser().id;
  return useMutation({
    mutationFn: ({ boardId }) => removeMember({ boardId, userId }),
    onSuccess: (_data, { boardId }) => {
      if (getLastBoard()?.id === boardId) clearLastBoard();
      qc.removeQueries({ queryKey: boardQueryKey(boardId) });
      for (const queryKey of [boardsQueryKey, kidsQueryKey, pictogramsQueryKey]) {
        qc.invalidateQueries({ queryKey });
      }
    },
  });
};
