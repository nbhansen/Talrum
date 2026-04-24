import { useQuery, type UseQueryResult } from '@tanstack/react-query';

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

export const useBoards = (): UseQueryResult<Board[]> =>
  useQuery({ queryKey: boardsQueryKey, queryFn: fetchBoards });

export const useBoard = (id: string): UseQueryResult<Board> =>
  useQuery({ queryKey: boardQueryKey(id), queryFn: () => fetchBoard(id), enabled: id !== '' });
