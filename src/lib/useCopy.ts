import { useEffect, useRef, useState } from 'react';

export interface CopyState {
  copied: boolean;
  error: string | null;
  copy: (text: string) => void;
}

const FALLBACK_MESSAGE = "Couldn't copy — select the ID and copy manually.";
const COPIED_FLASH_MS = 1500;

/**
 * `copy(text)` flashes `copied` for 1.5s. An insecure origin is short-circuited
 * before the call, because browsers reject `navigator.clipboard` there with an
 * unhelpful DOMException.
 */
export const useCopy = (): CopyState => {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );
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
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setCopied(false), COPIED_FLASH_MS);
      },
      () => {
        setError(FALLBACK_MESSAGE);
      },
    );
  };
  return { copied, error, copy };
};
