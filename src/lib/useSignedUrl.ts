import { useEffect, useState } from 'react';

import { signedUrlFor } from './storage';

/**
 * Resolves a storage path to a signed URL. Returns `null` while loading or
 * on error (callers should render a placeholder in that state). Re-runs when
 * bucket/path change; cancelled updates if the component unmounts first.
 */
export const useSignedUrl = (
  bucket: string,
  path: string | undefined,
): string | null => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    setUrl(null);
    signedUrlFor(bucket, path)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [bucket, path]);
  return url;
};
