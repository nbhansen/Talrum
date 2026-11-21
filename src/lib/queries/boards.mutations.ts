import { useMutation, type UseMutationResult, useQueryClient } from '@tanstack/react-query';

import { useSessionUser } from '@/lib/auth/session';
import { forgetLastBoard } from '@/lib/lastBoard';
import { enqueueAndDrain, hasQueuedWrites } from '@/lib/outbox';
import { captureException } from '@/lib/platform/telemetry';
import { boardMembersQueryKey } from '@/lib/queries/board-members';
import {
  type BoardFields,
  boardFieldsToRow,
  boardQueryKey,
  boardsQueryKey,
  rowToBoard,
} from '@/lib/queries/boards.read';
import {
  listCache,
  type OptimisticListContext,
  useOptimisticListMutation,
} from '@/lib/queries/optimistic';
import { supabase } from '@/lib/supabase';
import type { AccentBg } from '@/theme/tokens';
import type { Board, BoardKind } from '@/types/domain';

/**
 * The updater runs against the cache when the write starts, so a retry with
 * the same input re-derives from current data. A snapshot closed over at
 * render time is clobbered when a drain or another tab shifts the cache (#80).
 */
export interface BoardUpdate {
  boardId: string;
  update: (board: Board) => Partial<BoardFields>;
}

/**
 * Every board write: optimistic patch, outbox enqueue, then invalidate both
 * caches. A non-retryable error rolls the snapshot back; a transient one is
 * absorbed by the outbox and the patch stands.
 */
export const useUpdateBoard = (): UseMutationResult<void, Error, BoardUpdate> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ boardId, update }) => {
      const key = boardQueryKey(boardId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Board>(key);
      if (!previous) {
        // Every caller gates on a loaded board, so a miss means a future wiring
        // fired this before its data. The write is dropped; report it (#365).
        const err = new Error(`useUpdateBoard: no cached board for ${boardId}; write skipped`);
        if (import.meta.env.DEV) console.warn(err.message);
        captureException(err, { tags: { component: 'useUpdateBoard' } });
        return;
      }
      const fields = update(previous);
      qc.setQueryData<Board>(key, { ...previous, ...fields });
      // The conflict-guard baseline (#281). None means last-write-wins.
      const baseline = previous.serverUpdatedAt;
      try {
        await enqueueAndDrain({
          kind: 'updateBoard',
          boardId,
          patch: boardFieldsToRow(fields),
          ...(baseline === undefined ? {} : { expectedUpdatedAt: baseline }),
        });
      } catch (err) {
        qc.setQueryData(key, previous);
        throw err;
      }
    },
    onSettled: async (_data, _err, { boardId }) => {
      if (await hasQueuedWrites()) return;
      qc.invalidateQueries({ queryKey: boardQueryKey(boardId) });
      qc.invalidateQueries({ queryKey: boardsQueryKey });
    },
  });
};

interface CreateBoardInput {
  name: string;
  kind: BoardKind;
  kidId: string;
  /** Defaults to the first slot of the accent cycle. */
  accent?: AccentBg;
}

/**
 * Direct insert, no outbox, like `useCreateKid`. Create-then-navigate needs the
 * row to exist before routing, and the outbox would surface an RLS denial only
 * at drain time. See docs/queries.md for the decision rule.
 */
export const useCreateBoard = (): UseMutationResult<Board, Error, CreateBoardInput> => {
  const qc = useQueryClient();
  const ownerId = useSessionUser().id;
  return useMutation({
    mutationFn: async ({ name, kind, kidId, accent = 'sage' }) => {
      const { data, error } = await supabase
        .from('boards')
        .insert({
          owner_id: ownerId,
          kid_id: kidId,
          name: name.trim(),
          kind,
          labels_visible: true,
          voice_mode: 'parent',
          step_ids: [],
          kid_reorderable: false,
          accent,
        })
        .select()
        .single();
      if (error) throw error;
      return rowToBoard(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: boardsQueryKey });
    },
  });
};

interface DeleteBoardInput {
  boardId: string;
}

/**
 * The per-board and members caches go after the write, not in onMutate: the
 * builder still observes the per-board key until the route navigates away, and
 * a removed-while-observed query refetches into BoardNotFound.
 */
export const useDeleteBoard = (): UseMutationResult<
  void,
  Error,
  DeleteBoardInput,
  OptimisticListContext
> => {
  const qc = useQueryClient();
  return useOptimisticListMutation({
    caches: [
      listCache<Board, DeleteBoardInput>(boardsQueryKey, (list, { boardId }) =>
        list?.filter((b) => b.id !== boardId),
      ),
    ],
    onMutateSideEffect: ({ boardId }) => forgetLastBoard(boardId),
    // On error the board still exists and the builder still shows it, so only
    // a successful delete may evict its caches.
    mutationFn: async ({ boardId }) => {
      await enqueueAndDrain({ kind: 'deleteBoard', boardId });
      qc.removeQueries({ queryKey: boardQueryKey(boardId) });
      qc.removeQueries({ queryKey: boardMembersQueryKey(boardId) });
    },
  });
};
