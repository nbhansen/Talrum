import {
  type QueryClient,
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useMemo } from 'react';

import { useSessionUser } from '@/lib/auth/session';
import { enqueueAndDrain } from '@/lib/outbox';
import { boardsQueryKey } from '@/lib/queries/boards.read';
import { supabase } from '@/lib/supabase';
import type { Board, GlyphName, Pictogram } from '@/types/domain';
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

const patchPictogramInList = (
  list: Pictogram[] | undefined,
  id: string,
  patch: (p: Pictogram) => Pictogram,
): Pictogram[] | undefined => list?.map((p) => (p.id === id ? patch(p) : p));

/**
 * Walk every pictogram currently in the cache and `URL.revokeObjectURL` any
 * `blob:` imagePath / audioPath. Optimistic mutations plant local blob URLs
 * for instant render; once the outbox uploads succeed the next `invalidateQueries`
 * refetch replaces the row with a real signed-URL path, but the blob keeps
 * its memory reference unless we explicitly revoke. Sweep before invalidation
 * so the next refetch resolves the real URL into the cache slot we just freed.
 *
 * Called by onSuccess and onError of every pictogram mutation that plants a
 * blob URL. Known accepted races:
 *
 *   - Two concurrent uploads: the earlier one's sweep also revokes the later
 *     one's still-pending blob → brief broken-image flash on the second tile
 *     until invalidation refetches the real signed URL.
 *   - Audio mid-buffer: revoking a `blob:` URL while an `<audio>` element is
 *     mid-load can stop playback. Recordings are small (KBs), uploads are
 *     normally faster than the user can hit play immediately after recording,
 *     so this rarely surfaces in practice.
 *
 * Both are accepted tradeoffs in exchange for the simpler "scan all blobs"
 * implementation; the alternative (per-mutation id tracking through
 * onSuccess/onError contexts) is significantly more wiring for a workflow
 * that doesn't realistically produce concurrent uploads.
 */
const revokePictogramBlobs = (qc: QueryClient): void => {
  const list = qc.getQueryData<Pictogram[]>(pictogramsQueryKey);
  if (!list) return;
  for (const p of list) {
    if (p.style === 'photo' && p.imagePath?.startsWith('blob:')) {
      URL.revokeObjectURL(p.imagePath);
    }
    if (p.audioPath?.startsWith('blob:')) {
      URL.revokeObjectURL(p.audioPath);
    }
  }
};

export const __test_revokePictogramBlobs = revokePictogramBlobs;

interface SetAudioInput {
  pictogramId: string;
  blob: Blob;
  extension: string;
  /** Path to remove if the upload replaces a recording with a different ext. */
  previousPath?: string | null;
}

/**
 * Optimistically points the pictogram at a local blob URL and queues the
 * upload through the outbox. Drain replaces the blob URL with the real
 * server path on success; offline writes wait for `online` and replay.
 */
export const useSetPictogramAudio = (): UseMutationResult<void, Error, SetAudioInput> => {
  const qc = useQueryClient();
  const ownerId = useSessionUser().id;
  return useMutation({
    onMutate: ({ pictogramId, blob }) => {
      const blobUrl = URL.createObjectURL(blob);
      qc.setQueryData<Pictogram[]>(pictogramsQueryKey, (list) =>
        patchPictogramInList(list, pictogramId, (p) => ({ ...p, audioPath: blobUrl })),
      );
    },
    mutationFn: ({ pictogramId, blob, extension, previousPath }) =>
      enqueueAndDrain({
        kind: 'setPictoAudio',
        pictogramId,
        ownerId,
        blob,
        extension,
        ...(previousPath ? { previousPath } : {}),
      }),
    onSuccess: () => {
      revokePictogramBlobs(qc);
      qc.invalidateQueries({ queryKey: pictogramsQueryKey });
    },
    onError: () => {
      revokePictogramBlobs(qc);
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
  const ownerId = useSessionUser().id;
  return useMutation({
    mutationFn: async ({ label, blob, extension }) => {
      const id = crypto.randomUUID();
      const blobUrl = URL.createObjectURL(blob);
      const optimistic: Pictogram = {
        id,
        label: label.trim(),
        style: 'photo',
        imagePath: blobUrl,
      };
      qc.setQueryData<Pictogram[]>(pictogramsQueryKey, (list) => [...(list ?? []), optimistic]);
      await enqueueAndDrain({
        kind: 'createPhotoPicto',
        pictogramId: id,
        ownerId,
        label: label.trim(),
        blob,
        extension,
      });
      // Real path the server will end up serving; the cache invalidation in
      // onSuccess refetches and replaces the blob URL with the signed path.
      return { id, imagePath: `${ownerId}/${id}.${extension}` };
    },
    onSuccess: () => {
      revokePictogramBlobs(qc);
      qc.invalidateQueries({ queryKey: pictogramsQueryKey });
    },
    onError: (_err, _input, _ctx) => {
      // Drop the optimistic row; the user got an error.
      revokePictogramBlobs(qc);
      qc.invalidateQueries({ queryKey: pictogramsQueryKey });
    },
  });
};

interface RenameInput {
  pictogramId: string;
  label: string;
}

export const useRenamePictogram = (): UseMutationResult<
  void,
  Error,
  RenameInput,
  { previous: Pictogram[] | undefined }
> => {
  const qc = useQueryClient();
  return useMutation({
    onMutate: async ({ pictogramId, label }) => {
      await qc.cancelQueries({ queryKey: pictogramsQueryKey });
      const previous = qc.getQueryData<Pictogram[]>(pictogramsQueryKey);
      qc.setQueryData<Pictogram[]>(pictogramsQueryKey, (list) =>
        patchPictogramInList(list, pictogramId, (p) => ({ ...p, label })),
      );
      return { previous };
    },
    mutationFn: ({ pictogramId, label }) =>
      enqueueAndDrain({ kind: 'renamePicto', pictogramId, label }),
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) qc.setQueryData(pictogramsQueryKey, ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: pictogramsQueryKey });
    },
  });
};

interface ReplaceImageInput {
  pictogramId: string;
  blob: Blob;
  extension: string;
  /** Path of the prior image. Stock-prefixed (`stock:<slug>`) values are skipped by the handler — only real Storage objects are removed. */
  previousPath?: string | undefined;
}

export const useReplacePictogramImage = (): UseMutationResult<
  void,
  Error,
  ReplaceImageInput,
  { previous: Pictogram[] | undefined }
> => {
  const qc = useQueryClient();
  const ownerId = useSessionUser().id;
  return useMutation({
    onMutate: async ({ pictogramId, blob }) => {
      await qc.cancelQueries({ queryKey: pictogramsQueryKey });
      const previous = qc.getQueryData<Pictogram[]>(pictogramsQueryKey);
      const blobUrl = URL.createObjectURL(blob);
      qc.setQueryData<Pictogram[]>(pictogramsQueryKey, (list) =>
        patchPictogramInList(list, pictogramId, (p) =>
          p.style === 'photo' ? { ...p, imagePath: blobUrl } : p,
        ),
      );
      return { previous };
    },
    mutationFn: ({ pictogramId, blob, extension, previousPath }) =>
      enqueueAndDrain({
        kind: 'replacePictoImage',
        pictogramId,
        ownerId,
        blob,
        extension,
        ...(previousPath ? { previousPath } : {}),
      }),
    onSuccess: () => {
      revokePictogramBlobs(qc);
      qc.invalidateQueries({ queryKey: pictogramsQueryKey });
    },
    onError: (_err, _input, ctx) => {
      // Revoke first while the blob URL is still in the cache (revoke walks
      // current cache state), then restore the pre-mutation snapshot so the
      // tile shows its prior imagePath. Restoring first would orphan the
      // blob URL — it'd be unreachable from the cache and never revoked.
      revokePictogramBlobs(qc);
      if (ctx?.previous) qc.setQueryData(pictogramsQueryKey, ctx.previous);
      qc.invalidateQueries({ queryKey: pictogramsQueryKey });
    },
  });
};

export interface DeletePictogramInput {
  pictogramId: string;
  scrubFromBoardIds: string[];
  previousImagePath?: string;
  previousAudioPath?: string;
}

export const referencingBoardIds = (
  pictogramId: string,
  boards: readonly Board[] | undefined,
): string[] => (boards ?? []).filter((b) => b.stepIds.includes(pictogramId)).map((b) => b.id);

export const useDeletePictogram = (): UseMutationResult<
  void,
  Error,
  DeletePictogramInput,
  { previousPictograms: Pictogram[] | undefined; previousBoards: Board[] | undefined }
> => {
  const qc = useQueryClient();
  return useMutation({
    onMutate: async ({ pictogramId }) => {
      await qc.cancelQueries({ queryKey: pictogramsQueryKey });
      await qc.cancelQueries({ queryKey: boardsQueryKey });
      const previousPictograms = qc.getQueryData<Pictogram[]>(pictogramsQueryKey);
      const previousBoards = qc.getQueryData<Board[]>(boardsQueryKey);
      qc.setQueryData<Pictogram[]>(pictogramsQueryKey, (list) =>
        list?.filter((p) => p.id !== pictogramId),
      );
      qc.setQueryData<Board[]>(boardsQueryKey, (list) =>
        list?.map((b) =>
          b.stepIds.includes(pictogramId)
            ? { ...b, stepIds: b.stepIds.filter((id) => id !== pictogramId) }
            : b,
        ),
      );
      return { previousPictograms, previousBoards };
    },
    mutationFn: ({ pictogramId, scrubFromBoardIds, previousImagePath, previousAudioPath }) =>
      enqueueAndDrain({
        kind: 'deletePicto',
        pictogramId,
        scrubFromBoardIds,
        ...(previousImagePath ? { previousImagePath } : {}),
        ...(previousAudioPath ? { previousAudioPath } : {}),
      }),
    onError: (_err, _input, ctx) => {
      if (ctx?.previousPictograms) qc.setQueryData(pictogramsQueryKey, ctx.previousPictograms);
      if (ctx?.previousBoards) qc.setQueryData(boardsQueryKey, ctx.previousBoards);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: pictogramsQueryKey });
      qc.invalidateQueries({ queryKey: boardsQueryKey });
    },
  });
};

export const useClearPictogramAudio = (): UseMutationResult<void, Error, ClearAudioInput> => {
  const qc = useQueryClient();
  return useMutation({
    onMutate: ({ pictogramId }) => {
      qc.setQueryData<Pictogram[]>(pictogramsQueryKey, (list) =>
        patchPictogramInList(list, pictogramId, (p) => {
          const { audioPath: _audioPath, ...rest } = p;
          return rest as Pictogram;
        }),
      );
    },
    mutationFn: ({ pictogramId, path }) =>
      enqueueAndDrain({ kind: 'clearPictoAudio', pictogramId, path }),
    onSuccess: () => {
      revokePictogramBlobs(qc);
      qc.invalidateQueries({ queryKey: pictogramsQueryKey });
    },
    onError: () => {
      revokePictogramBlobs(qc);
      qc.invalidateQueries({ queryKey: pictogramsQueryKey });
    },
  });
};
