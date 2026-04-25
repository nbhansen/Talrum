import {
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

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
// Postgres returns coded errors that the UI can render as friendly copy.
// Phase 5 only surfaces two: the PK collision when re-inviting a user, and
// the RLS rejection when a non-owner tries to share. Anything else falls
// through to a generic "couldn't add member" message.

export const isAlreadyMemberError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && 'code' in err && err.code === '23505';

export const isShareForbiddenError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && 'code' in err && err.code === '42501';

// ─── Mutations ──────────────────────────────────────────────────────────────
// Direct supabase writes (no outbox). Sharing is rare, low-throughput, and
// failing loudly when offline is fine — the user can re-paste the ID once
// they're back online. Going through the outbox would also bypass the
// `is_board_owner` RLS check at enqueue time and we'd only learn at drain.

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

export const useRemoveBoardMember = (): UseMutationResult<void, Error, RemoveBoardMemberInput> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ boardId, userId }) => {
      const { error } = await supabase
        .from('board_members')
        .delete()
        .eq('board_id', boardId)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: (_data, { boardId }) => {
      qc.invalidateQueries({ queryKey: boardMembersQueryKey(boardId) });
    },
  });
};
