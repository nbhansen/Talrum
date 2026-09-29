import { useCallback, useEffect, useRef, useState } from 'react';

interface BlobPreview<T> {
  preview: T | null;
  show: (next: T) => void;
  clear: () => void;
}

/** Holds one blob-URL preview and revokes its URL once it is replaced, cleared or unmounted. */
export const useBlobPreview = <T extends { previewUrl: string }>(): BlobPreview<T> => {
  const [preview, setPreview] = useState<T | null>(null);

  // A preview that lands after unmount never reaches the cleanup below. The
  // setup must re-assert true, or StrictMode's setup → cleanup → setup leaves
  // the guard permanently closed (#433).
  const openRef = useRef(true);
  useEffect(() => {
    openRef.current = true;
    return () => {
      openRef.current = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.previewUrl);
    };
  }, [preview]);

  const show = useCallback((next: T): void => {
    if (openRef.current) setPreview(next);
    else URL.revokeObjectURL(next.previewUrl);
  }, []);
  const clear = useCallback((): void => setPreview(null), []);

  return { preview, show, clear };
};
