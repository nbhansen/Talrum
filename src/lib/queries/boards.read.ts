import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { formatUpdated } from '@/lib/formatUpdated';
import { hasPgCode } from '@/lib/hasPgCode';
import { fetchAllRows } from '@/lib/queries/fetchAllRows';
import { supabase } from '@/lib/supabase';
import { type AccentBg } from '@/theme/tokens';
import type { Board, BoardKind, VoiceMode } from '@/types/domain';
import type { Database } from '@/types/supabase';

type BoardRow = Database['public']['Tables']['boards']['Row'];

/**
 * DB columns for `kind`, `voice_mode`, `accent` are plain `text`. The casts
 * below are safe because DB CHECK constraints hold each one to its union.
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
  accent: row.accent as AccentBg,
  updatedLabel: formatUpdated(row.updated_at),
  serverUpdatedAt: row.updated_at,
});

export const boardsQueryKey = ['boards'] as const;
export const boardQueryKey = (id: string): readonly ['boards', string] => ['boards', id];

const fetchBoards = async (): Promise<Board[]> => {
  const rows = await fetchAllRows(() => supabase.from('boards').select('*'));
  return rows
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at) || a.id.localeCompare(b.id))
    .map(rowToBoard);
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
export const isNotFoundError = (err: unknown): boolean => hasPgCode(err, 'PGRST116');

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
