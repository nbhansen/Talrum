import { useEffect, useRef, useState } from 'react';

const TITLE_DEBOUNCE_MS = 300;

interface TitleDraft {
  draft: string;
  change: (next: string) => void;
  restoreIfBlank: () => void;
}

/** The editable board name: debounced writes, flushed on unmount. */
export const useTitleDraft = (name: string, write: (name: string) => void): TitleDraft => {
  const [draft, setDraft] = useState(name);
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; write: () => void } | null>(null);
  // A refetch can bring a newer name (#766). While a rename waits, the
  // user's typing wins: their write will replace the server name anyway.
  useEffect(() => {
    if (!pending.current) setDraft(name);
  }, [name]);
  // Flush, not cancel: a back tap inside the debounce window dropped the last
  // edit (#444).
  useEffect(
    () => () => {
      if (!pending.current) return;
      clearTimeout(pending.current.timer);
      pending.current.write();
    },
    [],
  );

  const change = (next: string): void => {
    setDraft(next);
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = null;
    // Same rule as NewBoardModal: a blank name is never written (#480).
    const trimmed = next.trim();
    if (trimmed === '') return;
    const flush = (): void => {
      pending.current = null;
      write(trimmed);
    };
    pending.current = { timer: setTimeout(flush, TITLE_DEBOUNCE_MS), write: flush };
  };
  const restoreIfBlank = (): void => {
    if (draft.trim() === '') setDraft(name);
  };
  return { draft, change, restoreIfBlank };
};
