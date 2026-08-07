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
import { mintStoragePath } from '@/lib/storage';
import type { Board, Pictogram } from '@/types/domain';

const patchPictogramInList = (
  list: Pictogram[] | undefined,
  id: string,
  patch: (p: Pictogram) => Pictogram,
): Pictogram[] | undefined => list?.map((p) => (p.id === id ? patch(p) : p));

/**
 * Revoke every `blob:` URL an optimistic mutation planted, before the settle
 * refetch replaces the rows with signed URLs. Scanning all blobs rather than
 * tracking ids per mutation costs three accepted races — one of them silent
 * audio. They are named in docs/queries.md, "Accepted races in the blob sweep".
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

/** Sweep planted `blob:` URLs, then refetch. Runs on both outcomes. */
const revokeThenInvalidate = (qc: QueryClient) => (): void => {
  revokePictogramBlobs(qc);
  qc.invalidateQueries({ queryKey: pictogramsQueryKey });
};

interface SetAudioInput {
  pictogramId: string;
  blob: Blob;
  extension: string;
}

/** The blob URL renders now; the drain replaces it with the server path. */
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
    // No previous-path snapshot: this cache can hold a stale blob: URL, so the
    // handler reads the row instead (#418).
    mutationFn: ({ pictogramId, blob, extension }) =>
      enqueueAndDrain({
        kind: 'setPictoAudio',
        pictogramId,
        blob,
        // Once per entry, so replays reuse it and no abandoned run's late IO
        // can touch a newer recording (#415).
        path: mintStoragePath(ownerId, pictogramId, extension),
      }),
    // The sweep walks current cache state, and the rollback below removes this
    // URL from it.
    beforeRollback: () => revokePictogramBlobs(qc),
    settle: revokeThenInvalidate(qc),
  });
};

interface ClearAudioInput {
  pictogramId: string;
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
      const path = mintStoragePath(ownerId, id, extension);
      await enqueueAndDrain({
        kind: 'createPhotoPicto',
        pictogramId: id,
        ownerId,
        label: label.trim(),
        blob,
        path,
      });
      // The path the server will serve once the settle refetch lands.
      return { id, imagePath: path };
    },
    beforeRollback: () => revokePictogramBlobs(qc),
    settle: revokeThenInvalidate(qc),
  });
  // onMutate's patch needs the new row's id, so it is minted before the inner
  // mutation runs rather than inside mutationFn.
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
    mutationFn: ({ pictogramId, blob, extension }) =>
      enqueueAndDrain({
        kind: 'replacePictoImage',
        pictogramId,
        blob,
        path: mintStoragePath(ownerId, pictogramId, extension),
      }),
    // Restoring the snapshot first would make this URL unreachable from the
    // cache, and so never revoked.
    beforeRollback: () => revokePictogramBlobs(qc),
    settle: revokeThenInvalidate(qc),
  });
};

export interface DeletePictogramInput {
  pictogramId: string;
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
    mutationFn: ({ pictogramId }) => enqueueAndDrain({ kind: 'deletePicto', pictogramId }),
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
    mutationFn: ({ pictogramId }) => enqueueAndDrain({ kind: 'clearPictoAudio', pictogramId }),
    settle: revokeThenInvalidate(qc),
  });
};
