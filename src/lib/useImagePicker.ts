import { type ChangeEvent, type ComponentProps, useRef, useState } from 'react';

import { cropToSquareJpeg, type ProcessedImage } from './image';
import { useBlobPreview } from './useBlobPreview';

export interface ImagePicker {
  /** Spread onto an `<input>`; it is hidden and opened by `pickFile`. */
  inputProps: Required<
    Pick<ComponentProps<'input'>, 'ref' | 'type' | 'accept' | 'hidden' | 'onChange'>
  > & { onChange: (e: ChangeEvent<HTMLInputElement>) => void };
  /** The cropped image, ready to upload, with a `blob:` preview URL. */
  processed: ProcessedImage | null;
  processing: boolean;
  error: string | null;
  /** Opens the file chooser. */
  pickFile: () => void;
  /** Drops the current pick (revokes its preview URL) and clears errors. */
  reset: () => void;
}

/** The pick-a-photo flow; useBlobPreview owns the `blob:` URL lifecycle. */
export const useImagePicker = (): ImagePicker => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { preview: processed, show, clear } = useBlobPreview<ProcessedImage>();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickFile = (): void => fileInputRef.current?.click();

  const onChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0] ?? null;
    // Reset the input so re-picking the same file fires onChange again.
    e.target.value = '';
    if (!file) return;
    setError(null);
    clear();
    setProcessing(true);
    cropToSquareJpeg(file)
      .then(show)
      .catch(() => {
        setError('Could not read that image. Try a JPG or PNG.');
      })
      .finally(() => {
        setProcessing(false);
      });
  };

  const reset = (): void => {
    clear();
    setError(null);
  };

  const inputProps = {
    ref: fileInputRef,
    type: 'file',
    accept: 'image/jpeg,image/png,image/webp',
    hidden: true,
    onChange,
  };
  return { inputProps, processed, processing, error, pickFile, reset };
};
