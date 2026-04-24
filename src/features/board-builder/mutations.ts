import { useMutation, type UseMutationResult,useQueryClient } from '@tanstack/react-query';

import { boardQueryKey, boardsQueryKey } from '@/lib/queries/boards';
import { supabase } from '@/lib/supabase';
import type { Board, BoardKind, VoiceMode } from '@/types/domain';

/**
 * Generic wrapper for every board write. Applies an optimistic patch to the
 * cached board (so the UI snaps instantly), fires the SQL, then invalidates
 * both the per-id and the list caches. On error the previous snapshot is
 * rolled back.
 *
 * Every public mutation below is a three-line wrapper over this.
 */
const useBoardPatch = <Input,>(
  patch: (input: Input, current: Board) => Board,
  run: (input: Input) => Promise<void>,
): UseMutationResult<void, Error, Input, { previous: Board | undefined }> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: run,
    onMutate: async (input: Input) => {
      const boardId = (input as { boardId: string }).boardId;
      await qc.cancelQueries({ queryKey: boardQueryKey(boardId) });
      const previous = qc.getQueryData<Board>(boardQueryKey(boardId));
      if (previous) {
        qc.setQueryData<Board>(boardQueryKey(boardId), patch(input, previous));
      }
      return { previous };
    },
    onError: (_err, input, ctx) => {
      const boardId = (input as { boardId: string }).boardId;
      if (ctx?.previous) qc.setQueryData(boardQueryKey(boardId), ctx.previous);
    },
    onSettled: (_data, _err, input) => {
      const boardId = (input as { boardId: string }).boardId;
      qc.invalidateQueries({ queryKey: boardQueryKey(boardId) });
      qc.invalidateQueries({ queryKey: boardsQueryKey });
    },
  });
};

const updateBoard = async (
  boardId: string,
  patch: Partial<{
    name: string;
    kind: BoardKind;
    labels_visible: boolean;
    voice_mode: VoiceMode;
    step_ids: string[];
    kid_reorderable: boolean;
  }>,
): Promise<void> => {
  const { error } = await supabase.from('boards').update(patch).eq('id', boardId);
  if (error) throw error;
};

interface BoardIdInput {
  boardId: string;
}

export const useRenameBoard = (): UseMutationResult<
  void,
  Error,
  BoardIdInput & { name: string },
  { previous: Board | undefined }
> =>
  useBoardPatch(
    ({ name }, current) => ({ ...current, name }),
    ({ boardId, name }) => updateBoard(boardId, { name }),
  );

export const useSetBoardKind = (): UseMutationResult<
  void,
  Error,
  BoardIdInput & { kind: BoardKind },
  { previous: Board | undefined }
> =>
  useBoardPatch(
    ({ kind }, current) => ({ ...current, kind }),
    ({ boardId, kind }) => updateBoard(boardId, { kind }),
  );

export const useSetLabelsVisible = (): UseMutationResult<
  void,
  Error,
  BoardIdInput & { visible: boolean },
  { previous: Board | undefined }
> =>
  useBoardPatch(
    ({ visible }, current) => ({ ...current, labelsVisible: visible }),
    ({ boardId, visible }) => updateBoard(boardId, { labels_visible: visible }),
  );

export const useSetVoiceMode = (): UseMutationResult<
  void,
  Error,
  BoardIdInput & { mode: VoiceMode },
  { previous: Board | undefined }
> =>
  useBoardPatch(
    ({ mode }, current) => ({ ...current, voiceMode: mode }),
    ({ boardId, mode }) => updateBoard(boardId, { voice_mode: mode }),
  );

export const useSetStepIds = (): UseMutationResult<
  void,
  Error,
  BoardIdInput & { stepIds: string[] },
  { previous: Board | undefined }
> =>
  useBoardPatch(
    ({ stepIds }, current) => ({ ...current, stepIds }),
    ({ boardId, stepIds }) => updateBoard(boardId, { step_ids: stepIds }),
  );

export const useSetKidReorderable = (): UseMutationResult<
  void,
  Error,
  BoardIdInput & { reorderable: boolean },
  { previous: Board | undefined }
> =>
  useBoardPatch(
    ({ reorderable }, current) => ({ ...current, kidReorderable: reorderable }),
    ({ boardId, reorderable }) => updateBoard(boardId, { kid_reorderable: reorderable }),
  );
