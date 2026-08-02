import { type QueryClient, type UseMutationResult, useQueryClient } from '@tanstack/react-query';

import { useSessionUser } from '@/lib/auth/session';
import { enqueueAndDrain } from '@/lib/outbox';
import { boardsQueryKey } from '@/lib/queries/boards.read';
import {
  listCache,
  type OptimisticListContext,
  useOptimisticListMutation,
} from '@/lib/queries/optimistic';
import { pictogramsQueryKey } from '@/lib/queries/pictograms.read';
import type { Board, Pictogram } from '@/types/domain';

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
 * Called via `beforeRollback` and `settle` by every pictogram mutation that
 * plants a blob URL. Known accepted races:
 *
 *   - Two concurrent uploads: the earlier one's sweep also revokes the later
 *     one's still-pending blob → brief broken-image flash on the second tile
 *     until invalidation refetches the real signed URL.
 *   - Audio mid-buffer: revoking a `blob:` URL while an `<audio>` element is
 *     mid-load can stop playback. Recordings are small (KBs), uploads are
 *     normally faster than the user can hit play immediately after recording,
 *     so this rarely surfaces in practice.
 *   - Error-path double sweep: `beforeRollback` sweeps before the snapshot
 *     restore (the failed mutation's own planted URL must be revoked while
 *     the cache still references it), then `settle` sweeps again after. The
 *     second pass can revoke a URL the restore resurrected — one planted by
 *     an earlier, not-yet-reconciled mutation. Error paths only run on the
 *     online fast path, so the settle invalidation refetches real paths
 *     immediately; the cost is the same brief flash as above.
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

/**
 * Shared settle tail for blob-planting mutations: sweep stale `blob:` URLs,
 * then refetch so the cache picks up the real signed paths (success) or
 * drops the optimistic row (error). Runs on both outcomes via `onSettled`.
 */
const revokeThenInvalidate = (qc: QueryClient) => (): void => {
  revokePictogramBlobs(qc);
  qc.invalidateQueries({ queryKey: pictogramsQueryKey });
};

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
export const useSetPictogramAudio = (): UseMutationResult<
  void,
  Error,
  SetAudioInput,
  OptimisticListContext
> => {
  const qc = useQueryClient();
  const ownerId = useSessionUser().id;
  return useOptimisticListMutation({
    caches: [
      listCache<Pictogram, SetAudioInput>(pictogramsQueryKey, (list, { pictogramId, blob }) => {
        if (!list) return list;
        const blobUrl = URL.createObjectURL(blob);
        return patchPictogramInList(list, pictogramId, (p) => ({ ...p, audioPath: blobUrl }));
      }),
    ],
    mutationFn: ({ pictogramId, blob, extension, previousPath }) =>
      enqueueAndDrain({
        kind: 'setPictoAudio',
        pictogramId,
        ownerId,
        blob,
        extension,
        ...(previousPath ? { previousPath } : {}),
      }),
    // Revoke while the blob URL is still in the cache — the sweep walks
    // current cache state, and the rollback below removes the URL from it.
    beforeRollback: () => revokePictogramBlobs(qc),
    settle: revokeThenInvalidate(qc),
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

/** `CreatePhotoInput` plus the id minted at the mutate boundary. */
type CreatePhotoQueuedInput = CreatePhotoInput & { id: string };

export const useCreatePhotoPictogram = (): UseMutationResult<
  CreatedPhotoPictogram,
  Error,
  CreatePhotoInput,
  OptimisticListContext
> => {
  const qc = useQueryClient();
  const ownerId = useSessionUser().id;
  const inner = useOptimisticListMutation<CreatePhotoQueuedInput, CreatedPhotoPictogram>({
    caches: [
      listCache<Pictogram, CreatePhotoQueuedInput>(
        pictogramsQueryKey,
        (list, { id, label, blob }) => [
          ...(list ?? []),
          { id, label: label.trim(), style: 'photo', imagePath: URL.createObjectURL(blob) },
        ],
      ),
    ],
    mutationFn: async ({ id, label, blob, extension }) => {
      await enqueueAndDrain({
        kind: 'createPhotoPicto',
        pictogramId: id,
        ownerId,
        label: label.trim(),
        blob,
        extension,
      });
      // Real path the server will end up serving; the settle invalidation
      // refetches and replaces the blob URL with the signed path.
      return { id, imagePath: `${ownerId}/${id}.${extension}` };
    },
    beforeRollback: () => revokePictogramBlobs(qc),
    settle: revokeThenInvalidate(qc),
  });
  // The optimistic patch in onMutate needs the new row's id, so the id is
  // minted here — before the inner mutation runs — not inside mutationFn.
  return {
    ...inner,
    mutate: (input, options) => {
      inner.mutate({ ...input, id: crypto.randomUUID() }, options);
    },
    mutateAsync: (input, options) =>
      inner.mutateAsync({ ...input, id: crypto.randomUUID() }, options),
  };
};

interface RenameInput {
  pictogramId: string;
  label: string;
}

export const useRenamePictogram = (): UseMutationResult<
  void,
  Error,
  RenameInput,
  OptimisticListContext
> =>
  useOptimisticListMutation({
    caches: [
      listCache<Pictogram, RenameInput>(pictogramsQueryKey, (list, { pictogramId, label }) =>
        patchPictogramInList(list, pictogramId, (p) => ({ ...p, label })),
      ),
    ],
    mutationFn: ({ pictogramId, label }) =>
      enqueueAndDrain({ kind: 'renamePicto', pictogramId, label }),
  });

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
  OptimisticListContext
> => {
  const qc = useQueryClient();
  const ownerId = useSessionUser().id;
  return useOptimisticListMutation({
    caches: [
      listCache<Pictogram, ReplaceImageInput>(pictogramsQueryKey, (list, { pictogramId, blob }) => {
        if (!list) return list;
        const blobUrl = URL.createObjectURL(blob);
        return patchPictogramInList(list, pictogramId, (p) =>
          p.style === 'photo' ? { ...p, imagePath: blobUrl } : p,
        );
      }),
    ],
    mutationFn: ({ pictogramId, blob, extension, previousPath }) =>
      enqueueAndDrain({
        kind: 'replacePictoImage',
        pictogramId,
        ownerId,
        blob,
        extension,
        ...(previousPath ? { previousPath } : {}),
      }),
    // Revoke while the blob URL is still in the cache (revoke walks current
    // cache state); restoring the snapshot first would orphan the URL — it'd
    // be unreachable from the cache and never revoked.
    beforeRollback: () => revokePictogramBlobs(qc),
    settle: revokeThenInvalidate(qc),
  });
};

export interface DeletePictogramInput {
  pictogramId: string;
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
  OptimisticListContext
> =>
  useOptimisticListMutation({
    caches: [
      listCache<Pictogram, DeletePictogramInput>(pictogramsQueryKey, (list, { pictogramId }) =>
        list?.filter((p) => p.id !== pictogramId),
      ),
      listCache<Board, DeletePictogramInput>(boardsQueryKey, (list, { pictogramId }) =>
        list?.map((b) =>
          b.stepIds.includes(pictogramId)
            ? { ...b, stepIds: b.stepIds.filter((id) => id !== pictogramId) }
            : b,
        ),
      ),
    ],
    mutationFn: ({ pictogramId, previousImagePath, previousAudioPath }) =>
      enqueueAndDrain({
        kind: 'deletePicto',
        pictogramId,
        ...(previousImagePath ? { previousImagePath } : {}),
        ...(previousAudioPath ? { previousAudioPath } : {}),
      }),
  });

export const useClearPictogramAudio = (): UseMutationResult<
  void,
  Error,
  ClearAudioInput,
  OptimisticListContext
> => {
  const qc = useQueryClient();
  return useOptimisticListMutation({
    caches: [
      listCache<Pictogram, ClearAudioInput>(pictogramsQueryKey, (list, { pictogramId }) =>
        patchPictogramInList(list, pictogramId, (p) => {
          const { audioPath: _audioPath, ...rest } = p;
          return rest as Pictogram;
        }),
      ),
    ],
    mutationFn: ({ pictogramId, path }) =>
      enqueueAndDrain({ kind: 'clearPictoAudio', pictogramId, path }),
    settle: revokeThenInvalidate(qc),
  });
};
