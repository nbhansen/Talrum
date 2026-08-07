import { useMutation, type UseMutationResult, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { useSessionUser } from '@/lib/auth/session';
import { type BoardRowPatch, enqueueAndDrain } from '@/lib/outbox';
import { boardQueryKey, boardsQueryKey, rowToBoard } from '@/lib/queries/boards.read';
import { supabase } from '@/lib/supabase';
import { type Accent } from '@/theme/tokens';
import type { Board, BoardKind, VoiceMode } from '@/types/domain';

/**
 * Every board write: optimistic patch, outbox enqueue, then invalidate both
 * caches. A non-retryable error rolls the snapshot back; a transient one is
 * absorbed by the outbox and the patch stands.
 */
const useBoardPatch = <Input extends { boardId: string }>(
  patch: (input: Input, current: Board) => Board,
  toRowPatch: (input: Input) => BoardRowPatch,
): UseMutationResult<void, Error, Input, { previous: Board | undefined }> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) => {
      // The conflict-guard baseline (#281). This read happens after onMutate
      // patched the cache, and is safe only because onMutate reasserts the
      // pre-patch serverUpdatedAt. No baseline means last-write-wins.
      const baseline = qc.getQueryData<Board>(boardQueryKey(input.boardId))?.serverUpdatedAt;
      return enqueueAndDrain({
        kind: 'updateBoard',
        boardId: input.boardId,
        patch: toRowPatch(input),
        ...(baseline === undefined ? {} : { expectedUpdatedAt: baseline }),
      });
    },
    onMutate: async (input) => {
      const { boardId } = input;
      await qc.cancelQueries({ queryKey: boardQueryKey(boardId) });
      const previous = qc.getQueryData<Board>(boardQueryKey(boardId));
      if (previous) {
        // mutationFn reads the guard baseline from this slot after the patch,
        // so no patch function may clobber it.
        qc.setQueryData<Board>(boardQueryKey(boardId), {
          ...patch(input, previous),
          ...(previous.serverUpdatedAt === undefined
            ? {}
            : { serverUpdatedAt: previous.serverUpdatedAt }),
        });
      }
      return { previous };
    },
    onError: (_err, { boardId }, ctx) => {
      if (ctx?.previous) qc.setQueryData(boardQueryKey(boardId), ctx.previous);
    },
    onSettled: (_data, _err, { boardId }) => {
      qc.invalidateQueries({ queryKey: boardQueryKey(boardId) });
      qc.invalidateQueries({ queryKey: boardsQueryKey });
    },
  });
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
    ({ name }) => ({ name }),
  );

export const useSetBoardKind = (): UseMutationResult<
  void,
  Error,
  BoardIdInput & { kind: BoardKind },
  { previous: Board | undefined }
> =>
  useBoardPatch(
    ({ kind }, current) => ({ ...current, kind }),
    ({ kind }) => ({ kind }),
  );

export const useSetLabelsVisible = (): UseMutationResult<
  void,
  Error,
  BoardIdInput & { visible: boolean },
  { previous: Board | undefined }
> =>
  useBoardPatch(
    ({ visible }, current) => ({ ...current, labelsVisible: visible }),
    ({ visible }) => ({ labels_visible: visible }),
  );

export const useSetVoiceMode = (): UseMutationResult<
  void,
  Error,
  BoardIdInput & { mode: VoiceMode },
  { previous: Board | undefined }
> =>
  useBoardPatch(
    ({ mode }, current) => ({ ...current, voiceMode: mode }),
    ({ mode }) => ({ voice_mode: mode }),
  );

/**
 * The updater form exists so the read happens inside `mutate()`, against the
 * current cache. A snapshot closed over at render time is clobbered when a
 * drain, another tab, or a long-open picker shifts the cache underneath it.
 */
export interface SetStepIdsInput {
  boardId: string;
  update: (prev: string[]) => string[];
}

export interface SetStepIdsResult {
  mutate: (input: SetStepIdsInput) => void;
  /** Re-runs the last input against the current cache, not a stale snapshot. */
  retry: () => void;
  isError: boolean;
  error: Error | null;
  isPending: boolean;
  reset: () => void;
}

/**
 * Not a plain `useBoardPatch` consumer: `toRowPatch` cannot see `current`, so
 * the new array must be computed before `mutationFn` runs. Storing the updater
 * as `lastInput` is what lets `retry()` re-derive against the current cache.
 */
export const useSetStepIds = (): SetStepIdsResult => {
  const qc = useQueryClient();
  const inner = useBoardPatch<BoardIdInput & { stepIds: string[] }>(
    ({ stepIds }, current) => ({ ...current, stepIds }),
    ({ stepIds }) => ({ step_ids: stepIds }),
  );
  const lastInput = useRef<SetStepIdsInput | null>(null);

  const run = ({ boardId, update }: SetStepIdsInput): void => {
    const fresh = qc.getQueryData<Board>(boardQueryKey(boardId));
    if (!fresh) {
      // Every caller gates on a loaded `board`, so a miss means a future wiring
      // put this hook ahead of its data (#365).
      if (import.meta.env.DEV) {
        console.warn(
          `[useSetStepIds] no cached board for ${boardId}; mutation skipped. ` +
            `Caller likely fired before the board query resolved.`,
        );
      }
      return;
    }
    inner.mutate({ boardId, stepIds: update(fresh.stepIds) });
  };

  return {
    mutate: (input) => {
      lastInput.current = input;
      run(input);
    },
    retry: () => {
      if (lastInput.current) run(lastInput.current);
    },
    isError: inner.isError,
    error: inner.error,
    isPending: inner.isPending,
    reset: inner.reset,
  };
};

export const useSetKidReorderable = (): UseMutationResult<
  void,
  Error,
  BoardIdInput & { reorderable: boolean },
  { previous: Board | undefined }
> =>
  useBoardPatch(
    ({ reorderable }, current) => ({ ...current, kidReorderable: reorderable }),
    ({ reorderable }) => ({ kid_reorderable: reorderable }),
  );

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
          voice_mode: 'tts',
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
