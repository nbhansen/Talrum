import { useMutation, type UseMutationResult, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { useSessionUser } from '@/lib/auth/session';
import { type BoardRowPatch, enqueueAndDrain } from '@/lib/outbox';
import { boardQueryKey, boardsQueryKey, rowToBoard } from '@/lib/queries/boards.read';
import { supabase } from '@/lib/supabase';
import { type Accent } from '@/theme/tokens';
import type { Board, BoardKind, VoiceMode } from '@/types/domain';

/**
 * Generic wrapper for every board write. Applies an optimistic patch to the
 * cached board (so the UI snaps instantly), enqueues the SQL through the
 * outbox so offline edits queue + replay automatically, then invalidates
 * both the per-id and the list caches. On a non-retryable error (RLS,
 * validation) the previous snapshot is rolled back; transient network
 * errors are absorbed by the outbox and the optimistic patch stands.
 *
 * Every public mutation below is a three-line wrapper over this.
 */
const useBoardPatch = <Input extends { boardId: string }>(
  patch: (input: Input, current: Board) => Board,
  toRowPatch: (input: Input) => BoardRowPatch,
): UseMutationResult<void, Error, Input, { previous: Board | undefined }> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      enqueueAndDrain({
        kind: 'updateBoard',
        boardId: input.boardId,
        patch: toRowPatch(input),
      }),
    onMutate: async (input) => {
      const { boardId } = input;
      await qc.cancelQueries({ queryKey: boardQueryKey(boardId) });
      const previous = qc.getQueryData<Board>(boardQueryKey(boardId));
      if (previous) {
        qc.setQueryData<Board>(boardQueryKey(boardId), patch(input, previous));
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
 * Step-id mutations always merge against the **current cache**, never a
 * closed-over snapshot — closures captured at render time get clobbered when
 * another tab, an outbox drain, or a long-open picker modal shifts the cache
 * underneath us. Callers pass an updater `(prev) => next` so the read happens
 * inside the hook, at the synchronous boundary of `mutate()`.
 */
export interface SetStepIdsInput {
  boardId: string;
  update: (prev: string[]) => string[];
}

export interface SetStepIdsResult {
  mutate: (input: SetStepIdsInput) => void;
  /**
   * Re-runs the last input against the *current* cache. Re-reads `stepIds`
   * fresh so a retry after a transient failure doesn't reapply against a
   * stale snapshot. No-op if `mutate` was never called.
   */
  retry: () => void;
  isError: boolean;
  error: Error | null;
  isPending: boolean;
  reset: () => void;
}

/**
 * Wrapper (not a plain `useBoardPatch` consumer) for two reasons:
 *
 *  1. `useBoardPatch.toRowPatch(input)` doesn't see `current`, so we can't
 *     express `update: (prev) => next` as a closure-form input — the new
 *     `step_ids` array must be computed *before* `mutationFn` runs. The
 *     cache lookup in `run()` bridges that gap.
 *  2. `retry()` must re-derive against the **current** cache, not a saved
 *     snapshot — by the time a user clicks Retry, the outbox drain or
 *     another tab may have shifted `step_ids` further. Storing `lastInput`
 *     (the updater function), not `lastResult`, is what makes that work.
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
      // Cache should always be hydrated by the time the UI can call this —
      // every caller gates on a loaded `board`. A miss here means a future
      // wiring put `useSetStepIds` ahead of its data. Surface in dev only.
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
 * Direct Supabase insert (no outbox), matching the `useAddBoardMember` and
 * `useCreateKid` precedents. Outbox would surface RLS denials only at drain
 * time — wrong for create-then-navigate where the caller needs the row to
 * actually exist on the server before routing into the BoardBuilder.
 *
 * Defaults match the new-board column requirements from
 * `20260425000000_real_auth_onboarding.sql`: an empty step list, labels
 * visible, TTS voice, kid-reorderable off. The user can change all of these
 * in the BoardBuilder after creation.
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
          accent_ink: accent.ink,
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
