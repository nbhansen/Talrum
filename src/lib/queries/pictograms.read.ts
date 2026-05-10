import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';

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
      ...(row.slug ? { slug: row.slug } : {}),
      ...(row.audio_path ? { audioPath: row.audio_path } : {}),
    };
  }
  return {
    id: row.id,
    label: row.label,
    style: 'photo',
    ...(row.slug ? { slug: row.slug } : {}),
    ...(row.image_path ? { imagePath: row.image_path } : {}),
    ...(row.audio_path ? { audioPath: row.audio_path } : {}),
  };
};

const fetchPictograms = async (): Promise<Pictogram[]> => {
  const { data, error } = await supabase.from('pictograms').select('*').order('created_at');
  if (error) throw error;
  return data.map(rowToPictogram);
};

export const pictogramsQueryKey = ['pictograms'] as const;

export const usePictograms = (): UseQueryResult<Pictogram[]> =>
  useQuery({ queryKey: pictogramsQueryKey, queryFn: fetchPictograms });

/**
 * Convenience: same underlying query as `usePictograms`, but returns a
 * `Map<id, Pictogram>` so callers resolving `board.stepIds → Pictogram`
 * don't keep rebuilding the lookup. Returns an empty map while loading.
 *
 * Memoized on the `data` reference: React Query holds the array identity-
 * stable until it changes, so each consumer recomputes the Map at most
 * once per cache update — not once per render.
 */
export const usePictogramsById = (): Map<string, Pictogram> => {
  const { data } = usePictograms();
  return useMemo(() => new Map((data ?? []).map((p) => [p.id, p])), [data]);
};

/**
 * Lookup by seed slug ('apple', 'book') — useful for the few client-side
 * lists that reference specific seed pictograms by name. User-uploaded
 * pictograms have no slug and aren't in this map. Memoized on `data`.
 */
export const usePictogramsBySlug = (): Map<string, Pictogram> => {
  const { data } = usePictograms();
  return useMemo(() => {
    const out = new Map<string, Pictogram>();
    for (const p of data ?? []) {
      if (p.slug) out.set(p.slug, p);
    }
    return out;
  }, [data]);
};
