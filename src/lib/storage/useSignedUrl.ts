import { useEffect, useState } from 'react';

import { signedUrlFor } from './storage';

/** `null` while loading or on error, so callers render a placeholder. */
export const useSignedUrl = (bucket: string, path: string | undefined): string | null => {
  const [url, setUrl] = useState<string | null>(null);
  // The synchronous reset stops a stale URL flashing before the new fetch
  // resolves. Intentional for an async loader, not the cascading render the
  // lint rule targets.
  /* eslint-disable react-hooks/set-state-in-effect */
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
  /* eslint-enable react-hooks/set-state-in-effect */
  return url;
};
