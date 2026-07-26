import { useState } from 'react';

import { hasPin, pinGateDisabled, verifyPin } from '@/lib/pin';

interface PinExit {
  /** True while the PIN pad should be shown. */
  verifying: boolean;
  /** Ask to leave kid mode: opens the pad, or exits outright when there is no PIN. */
  requestExit: () => void;
  /** Close the pad without leaving. */
  cancel: () => void;
  /** PinPad's `onSubmit`: resolves false on a wrong PIN so the pad can say so. */
  verify: (pin: string) => Promise<boolean>;
}

/**
 * The rule for getting out of kid mode, in one place.
 *
 * It has two consumers — the gate on a working kid screen (`KidModeGate`) and
 * the fallback on a crashed one (`KidRouteFallback`) — and it has been got
 * wrong twice: #353 let the gate *create* the PIN it was supposed to check,
 * and #371 left the crash screen with no check at all. Both were holes in the
 * same sentence, so the sentence lives here now and each surface only decides
 * what "exit" means for it.
 *
 * The bypass is deliberate and is the part most likely to look like a bug.
 * With no PIN stored there is nothing to verify against, so a pad would trap
 * whoever is holding the iPad rather than gate anything — and the answer to
 * "no PIN" is already "no kid mode", which is what the route guard enforces on
 * the way in. Kid mode is only reachable in that state by clearing the PIN in
 * another tab mid-session.
 */
export const usePinExit = (onExit: () => void): PinExit => {
  const [verifying, setVerifying] = useState(false);

  return {
    verifying,
    requestExit: (): void => {
      if (pinGateDisabled() || !hasPin()) {
        onExit();
        return;
      }
      setVerifying(true);
    },
    cancel: (): void => setVerifying(false),
    verify: async (pin: string): Promise<boolean> => {
      const ok = await verifyPin(pin);
      if (ok) {
        setVerifying(false);
        onExit();
      }
      return ok;
    },
  };
};
