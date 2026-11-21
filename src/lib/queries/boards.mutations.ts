import { useMutation, type UseMutationResult, useQueryClient } from '@tanstack/react-query';

import { useSessionUser } from '@/lib/auth/session';
import { clearLastBoard, getLastBoard } from '@/lib/lastBoard';
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
import { type Accent } from '@/theme/tokens';
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
 * onMutate's result never reaches mutationFn, so the fields it derived travel
 * here, keyed by the input object TanStack passes to both.
 */
const derivedFields = new WeakMap<BoardUpdate, Partial<BoardFields>>();

/**
 * Every board write: optimistic patch, outbox enqueue, then invalidate both
 * caches. A non-retryable error rolls the snapshot back; a transient one is
 * absorbed by the outbox and the patch stands.
 */
export const useUpdateBoard = (): UseMutationResult<void, Error, BoardUpdate, BoardContext> => {
  const qc = useQueryClient();
  return useMutation({
    onMutate: async (input) => {
      const { boardId } = input;
      await qc.cancelQueries({ queryKey: boardQueryKey(boardId) });
      const previous = qc.getQueryData<Board>(boardQueryKey(boardId));
      if (previous) {
        const fields = input.update(previous);
        derivedFields.set(input, fields);
        qc.setQueryData<Board>(boardQueryKey(boardId), { ...previous, ...fields });
      }
      return { previous };
    },
    mutationFn: async (input) => {
      const fields = derivedFields.get(input);
      const baseline = qc.getQueryData<Board>(boardQueryKey(input.boardId))?.serverUpdatedAt;
      if (!fields) {
        // Every caller gates on a loaded board, so a miss means a future wiring
        // fired this before its data. The write is dropped; report it (#365).
        const err = new Error(
          `useUpdateBoard: no cached board for ${input.boardId}; write skipped`,
        );
        if (import.meta.env.DEV) console.warn(err.message);
        captureException(err, { tags: { component: 'useUpdateBoard' } });
        return;
      }
      // The conflict-guard baseline (#281), safe to read after the patch
      // because `fields` cannot hold serverUpdatedAt. None means last-write-wins.
      await enqueueAndDrain({
        kind: 'updateBoard',
        boardId: input.boardId,
        patch: boardFieldsToRow(fields),
        ...(baseline === undefined ? {} : { expectedUpdatedAt: baseline }),
      });
    },
    onError: (_err, { boardId }, ctx) => {
      if (ctx?.previous) qc.setQueryData(boardQueryKey(boardId), ctx.previous);
    },
    onSettled: async (_data, _err, { boardId }) => {
      if (await hasQueuedWrites()) return;
      qc.invalidateQueries({ queryKey: boardQueryKey(boardId) });
      qc.invalidateQueries({ queryKey: boardsQueryKey });
    },
  });
};

interface BoardContext {
  previous: Board | undefined;
}

interface CreateBoardInput {
  name: string;
  kind: BoardKind;
  kidId: string;
  /** Defaults to the first slot of the accent cycle (sage / sage-ink). */
  accent?: Accent;
}

const DEFAULT_ACCENT: Accent = { bg: 'sage', ink: 'sage-ink' };

/**
 * Direct insert, no outbox, like `useCreateKid`. Create-then-navigate needs the
 * row to exist before routing, and the outbox would surface an RLS denial only
 * at drain time. See docs/queries.md for the decision rule.
 */
export const useCreateBoard = (): UseMutationResult<Board, Error, CreateBoardInput> => {
  const qc = useQueryClient();
  const ownerId = useSessionUser().id;
  return useMutation({
    mutationFn: async ({ name, kind, kidId, accent = DEFAULT_ACCENT }) => {
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
          accent: accent.bg,
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
    onMutateSideEffect: ({ boardId }) => {
      if (getLastBoard()?.id === boardId) clearLastBoard();
    },
    // On error the board still exists and the builder still shows it, so only
    // a successful delete may evict its caches.
    mutationFn: async ({ boardId }) => {
      await enqueueAndDrain({ kind: 'deleteBoard', boardId });
      qc.removeQueries({ queryKey: boardQueryKey(boardId) });
      qc.removeQueries({ queryKey: boardMembersQueryKey(boardId) });
    },
  });
};
