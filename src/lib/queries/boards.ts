import {
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { formatUpdated } from '@/lib/formatUpdated';
import { supabase } from '@/lib/supabase';
import type { ColorToken } from '@/theme/tokens';
import type { Board, BoardKind, VoiceMode } from '@/types/domain';
import type { Database } from '@/types/supabase';

type BoardRow = Database['public']['Tables']['boards']['Row'];

/**
 * DB columns for `kind`, `voice_mode`, `accent`, `accent_ink` are plain
 * `string` — Postgres CHECK constraints don't narrow TS types. The casts
 * below are safe because writes go through the mutation layer which only
 * ever supplies domain-typed values.
 */
export const rowToBoard = (row: BoardRow): Board => ({
  id: row.id,
  ...(row.slug ? { slug: row.slug } : {}),
  ownerId: row.owner_id,
  kidId: row.kid_id,
  name: row.name,
  kind: row.kind as BoardKind,
  labelsVisible: row.labels_visible,
  voiceMode: row.voice_mode as VoiceMode,
  stepIds: [...row.step_ids],
  kidReorderable: row.kid_reorderable,
  accent: row.accent as ColorToken,
  accentInk: row.accent_ink as ColorToken,
  updatedLabel: formatUpdated(row.updated_at),
});

export const boardsQueryKey = ['boards'] as const;
export const boardQueryKey = (id: string): readonly ['boards', string] => ['boards', id];

const fetchBoards = async (): Promise<Board[]> => {
  const { data, error } = await supabase.from('boards').select('*').order('updated_at', {
    ascending: false,
  });
  if (error) throw error;
  return data.map(rowToBoard);
};

const fetchBoard = async (id: string): Promise<Board> => {
  const { data, error } = await supabase.from('boards').select('*').eq('id', id).single();
  if (error) throw error;
  return rowToBoard(data);
};

/**
 * PGRST116 = "JSON object requested, multiple (or no) rows returned" — raised
 * by `.single()` when a board doesn't exist or is hidden by RLS. It's
 * terminal: retrying the same UUID will produce the same answer.
 */
export const isNotFoundError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && 'code' in err && err.code === 'PGRST116';

export const useBoards = (): UseQueryResult<Board[]> =>
  useQuery({ queryKey: boardsQueryKey, queryFn: fetchBoards });

export const useBoard = (id: string): UseQueryResult<Board> =>
  useQuery({
    queryKey: boardQueryKey(id),
    queryFn: () => fetchBoard(id),
    enabled: id !== '',
    // Skip retries on PGRST116; retry transient network errors up to 3× (the
    // React Query default). Keeps not-found instant while still shielding
    // against flaky connections.
    retry: (failureCount, error) => !isNotFoundError(error) && failureCount < 3,
  });

// ─── Mutations ──────────────────────────────────────────────────────────────

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
