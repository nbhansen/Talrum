import { useEffect, useState } from 'react';

import { signedUrlFor } from './storage';

/**
 * Resolves a storage path to a signed URL. Returns `null` while loading or
 * on error (callers should render a placeholder in that state). Re-runs when
 * bucket/path change; cancelled updates if the component unmounts first.
 */
export const useSignedUrl = (bucket: string, path: string | undefined): string | null => {
  const [url, setUrl] = useState<string | null>(null);
  // The synchronous setUrl(null) resets to the loading/placeholder state when
  // bucket/path change so a stale signed URL doesn't flash before the new fetch
  // resolves. Intentional for an async storage loader — not the cascading-render
  // anti-pattern react-hooks 7's set-state-in-effect rule targets.
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
