import { useEffect, useState } from 'react';

import { signedUrlFor } from './storage';

/**
 * Resolves a storage path to a signed URL. Returns `null` while loading or
 * on error (callers should render a placeholder in that state).
 */
export const useSignedUrl = (bucket: string, path: string | undefined): string | null => {
  const key = path && `${bucket}/${path}`;
  // Keyed, so the URL of a previous path never shows for the current one.
  const [resolved, setResolved] = useState<{ key: string; url: string } | null>(null);
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    signedUrlFor(bucket, path)
      .then((url) => {
        if (!cancelled) setResolved({ key: `${bucket}/${path}`, url });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [bucket, path]);
  return resolved && resolved.key === key ? resolved.url : null;
};
