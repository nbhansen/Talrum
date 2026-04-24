import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { GlyphName, Pictogram } from '@/types/domain';
import type { Database } from '@/types/supabase';

type PictogramRow = Database['public']['Tables']['pictograms']['Row'];

/**
 * Narrow a DB row (strings + nulls) into the discriminated-union domain type.
 * The init migration's CHECK constraints guarantee the narrowing is safe —
 * (style='illus' ↔ glyph/tint non-null) and (style='photo' ↔ glyph/tint null).
 */
export const rowToPictogram = (row: PictogramRow): Pictogram => {
  if (row.style === 'illus') {
    return {
      id: row.id,
      label: row.label,
      style: 'illus',
      glyph: row.glyph as GlyphName,
      tint: row.tint as string,
      ...(row.audio_path ? { audioPath: row.audio_path } : {}),
    };
  }
  return {
    id: row.id,
    label: row.label,
    style: 'photo',
    ...(row.image_path ? { imagePath: row.image_path } : {}),
    ...(row.audio_path ? { audioPath: row.audio_path } : {}),
  };
};

export const pictogramToInsert = (
  p: Pictogram,
  ownerId: string,
): Database['public']['Tables']['pictograms']['Insert'] =>
  p.style === 'illus'
    ? {
        id: p.id,
        owner_id: ownerId,
        label: p.label,
        style: 'illus',
        glyph: p.glyph,
        tint: p.tint,
        audio_path: p.audioPath ?? null,
      }
    : {
        id: p.id,
        owner_id: ownerId,
        label: p.label,
        style: 'photo',
        image_path: p.imagePath ?? null,
        audio_path: p.audioPath ?? null,
      };

const fetchPictograms = async (): Promise<Pictogram[]> => {
  const { data, error } = await supabase.from('pictograms').select('*').order('created_at');
  if (error) throw error;
  return data.map(rowToPictogram);
};

export const usePictograms = (): UseQueryResult<Pictogram[]> =>
  useQuery({ queryKey: ['pictograms'], queryFn: fetchPictograms });

export const pictogramsQueryKey = ['pictograms'] as const;

/**
 * Convenience: same underlying query as `usePictograms`, but returns a
 * `Map<id, Pictogram>` so callers resolving `board.stepIds → Pictogram`
 * don't keep rebuilding the lookup. Returns an empty map while loading.
 */
export const usePictogramsById = (): Map<string, Pictogram> => {
  const { data } = usePictograms();
  return new Map((data ?? []).map((p) => [p.id, p]));
};
