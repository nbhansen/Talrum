import { useState } from 'react';

export interface CopyState {
  copied: boolean;
  error: string | null;
  copy: (text: string) => void;
}

const FALLBACK_MESSAGE = "Couldn't copy — select the ID and copy manually.";
const COPIED_FLASH_MS = 1500;

/**
 * Generic clipboard hook. `copy(text)` writes to the system clipboard, sets
 * `copied=true` for 1.5s, and resets. On a permission denial, an insecure
 * context (http://), or a missing Clipboard API surface, sets `error` to a
 * fallback message instead — Chrome/Safari reject `navigator.clipboard` on
 * non-HTTPS origins with an unhelpful DOMException, so we short-circuit
 * before calling and surface the same copy as the rejection path.
 */
export const useCopy = (): CopyState => {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = (text: string): void => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.clipboard ||
      (typeof window !== 'undefined' && window.isSecureContext === false)
    ) {
      setError(FALLBACK_MESSAGE);
      return;
    }
    setError(null);
    void navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), COPIED_FLASH_MS);
      },
      () => {
        setError(FALLBACK_MESSAGE);
      },
    );
  };
  return { copied, error, copy };
};
