import { type ChangeEvent, type RefObject, useEffect, useRef, useState } from 'react';

import { cropToSquareJpeg, type ProcessedImage } from './image';

export interface ImagePicker {
  /** Attach to the hidden `<input type="file">`. */
  fileInputRef: RefObject<HTMLInputElement | null>;
  /** The cropped image, ready to upload, with a `blob:` preview URL. */
  processed: ProcessedImage | null;
  processing: boolean;
  /** Name of the file being (or last successfully) processed. */
  fileName: string | null;
  error: string | null;
  /** Opens the file chooser. */
  pickFile: () => void;
  /** Attach to the hidden input's `onChange`. */
  onInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  /** Drops the current pick (revokes its preview URL) and clears errors. */
  reset: () => void;
}

/**
 * Pick-a-photo flow shared by UploadTab and PictogramSheet: hidden file
 * input, `cropToSquareJpeg`, and — the part worth centralizing — the
 * `blob:` preview-URL lifecycle. The effect below is the single revocation
 * point: whenever `processed` is replaced (new pick, reset) or the consumer
 * unmounts, the outgoing preview URL is revoked, so no caller has to
 * remember to.
 */
export const useImagePicker = (): ImagePicker => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [processed, setProcessed] = useState<ProcessedImage | null>(null);
  const [processing, setProcessing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (processed) URL.revokeObjectURL(processed.previewUrl);
    },
    [processed],
  );

  const pickFile = (): void => fileInputRef.current?.click();

  const onInputChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0] ?? null;
    // Reset the input so re-picking the same file fires onChange again.
    e.target.value = '';
    if (!file) return;
    setError(null);
    setFileName(file.name);
    setProcessed(null);
    setProcessing(true);
    cropToSquareJpeg(file)
      .then(setProcessed)
      .catch(() => {
        setError('Could not read that image. Try a JPG or PNG.');
        setFileName(null);
      })
      .finally(() => {
        setProcessing(false);
      });
  };

  const reset = (): void => {
    setProcessed(null);
    setFileName(null);
    setError(null);
  };

  return { fileInputRef, processed, processing, fileName, error, pickFile, onInputChange, reset };
};
