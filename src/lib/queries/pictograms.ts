import {
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import {
  AUDIO_BUCKET,
  IMAGES_BUCKET,
  invalidateSignedUrl,
  removeFromBucket,
  uploadBlob,
} from '@/lib/storage';
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

export const pictogramToInsert = (
  p: Pictogram,
  ownerId: string,
): Database['public']['Tables']['pictograms']['Insert'] =>
  p.style === 'illus'
    ? {
        id: p.id,
        owner_id: ownerId,
        slug: p.slug ?? null,
        label: p.label,
        style: 'illus',
        glyph: p.glyph,
        tint: p.tint,
        audio_path: p.audioPath ?? null,
      }
    : {
        id: p.id,
        owner_id: ownerId,
        slug: p.slug ?? null,
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

/**
 * Lookup by seed slug ('apple', 'book') — useful for the few client-side
 * lists that reference specific seed pictograms by name. User-uploaded
 * pictograms have no slug and aren't in this map.
 */
export const usePictogramsBySlug = (): Map<string, Pictogram> => {
  const { data } = usePictograms();
  const out = new Map<string, Pictogram>();
  for (const p of data ?? []) {
    if (p.slug) out.set(p.slug, p);
  }
  return out;
};

const currentUserId = async (): Promise<string> => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw error ?? new Error('not signed in');
  return data.user.id;
};

interface SetAudioInput {
  pictogramId: string;
  blob: Blob;
  extension: string;
  /** Path to remove if the upload replaces a recording with a different ext. */
  previousPath?: string | null;
}

export const useSetPictogramAudio = (): UseMutationResult<string, Error, SetAudioInput> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pictogramId, blob, extension, previousPath }) => {
      const ownerId = await currentUserId();
      const path = `${ownerId}/${pictogramId}.${extension}`;
      await uploadBlob(AUDIO_BUCKET, path, blob);
      invalidateSignedUrl(AUDIO_BUCKET, path);
      const { error } = await supabase
        .from('pictograms')
        .update({ audio_path: path })
        .eq('id', pictogramId);
      if (error) throw error;
      if (previousPath && previousPath !== path) {
        await removeFromBucket(AUDIO_BUCKET, [previousPath]).catch(() => undefined);
        invalidateSignedUrl(AUDIO_BUCKET, previousPath);
      }
      return path;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pictogramsQueryKey });
    },
  });
};

interface ClearAudioInput {
  pictogramId: string;
  path: string;
}

interface CreatePhotoInput {
  label: string;
  blob: Blob;
  extension: string;
}

interface CreatedPhotoPictogram {
  id: string;
  imagePath: string;
}

export const useCreatePhotoPictogram = (): UseMutationResult<
  CreatedPhotoPictogram,
  Error,
  CreatePhotoInput
> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ label, blob, extension }) => {
      const ownerId = await currentUserId();
      const id = crypto.randomUUID();
      const path = `${ownerId}/${id}.${extension}`;
      await uploadBlob(IMAGES_BUCKET, path, blob);
      invalidateSignedUrl(IMAGES_BUCKET, path);
      const { error } = await supabase.from('pictograms').insert({
        id,
        owner_id: ownerId,
        label: label.trim(),
        style: 'photo',
        image_path: path,
      });
      if (error) {
        await removeFromBucket(IMAGES_BUCKET, [path]).catch(() => undefined);
        throw error;
      }
      return { id, imagePath: path };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pictogramsQueryKey });
    },
  });
};

export const useClearPictogramAudio = (): UseMutationResult<void, Error, ClearAudioInput> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pictogramId, path }) => {
      await removeFromBucket(AUDIO_BUCKET, [path]).catch(() => undefined);
      invalidateSignedUrl(AUDIO_BUCKET, path);
      const { error } = await supabase
        .from('pictograms')
        .update({ audio_path: null })
        .eq('id', pictogramId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pictogramsQueryKey });
    },
  });
};
