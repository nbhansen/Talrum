import { useState } from 'react';

import { captureException } from '@/lib/platform/telemetry';

interface SheetAction {
  error: string | null;
  setError: (error: string | null) => void;
  /** Runs the write, closes on success, and shows fixed copy on failure (#679). */
  run: (op: string, failMessage: string, write: () => Promise<unknown>) => void;
}

export const useSheetAction = (component: string, onClose: () => void): SheetAction => {
  const [error, setError] = useState<string | null>(null);
  const run: SheetAction['run'] = (op, failMessage, write) => {
    setError(null);
    void (async () => {
      try {
        await write();
        onClose();
      } catch (err) {
        captureException(err, { tags: { component, op } });
        setError(failMessage);
      }
    })();
  };
  return { error, setError, run };
};
