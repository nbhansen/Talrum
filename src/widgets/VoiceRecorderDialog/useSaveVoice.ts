import { useCallback } from 'react';

import { extensionForMime } from '@/lib/platform/recording';
import { useSetPictogramAudio } from '@/lib/queries/pictograms';

interface SaveVoice {
  /** Resolves false after reporting the failure. */
  save: (blob: Blob) => Promise<boolean>;
  isPending: boolean;
}

/** `report` must be stable: `save` feeds the recorder's cap timer. */
export const useSaveVoice = (
  pictogramId: string,
  report: (message: string | null) => void,
): SaveVoice => {
  // mutateAsync is referentially stable, unlike the mutation object.
  const { mutateAsync, isPending } = useSetPictogramAudio();
  const save = useCallback(
    async (blob: Blob): Promise<boolean> => {
      try {
        // From the blob's MIME type, not a literal: the provider MIME type
        // is the one piece of provider knowledge the seam propagates.
        await mutateAsync({ pictogramId, blob, extension: extensionForMime(blob.type) });
        return true;
      } catch {
        report('Upload failed. Check your connection and try again.');
        return false;
      }
    },
    [mutateAsync, pictogramId, report],
  );
  return { save, isPending };
};
