import { useState, useSyncExternalStore } from 'react';

import { hasPin, pinGateDisabled, verifyPin } from '@/lib/pin';

import {
  getPinLockedUntil,
  recordPinFailure,
  resetPinThrottle,
  subscribePinThrottle,
} from './pinThrottle';

interface PinExit {
  /** True while the PIN pad should be shown. */
  verifying: boolean;
  /** Ask to leave kid mode: opens the pad, or exits outright when there is no PIN. */
  requestExit: () => void;
  /** Close the pad without leaving. */
  cancel: () => void;
  /** PinPad's `onSubmit`: resolves false on a wrong PIN so the pad can say so. */
  verify: (pin: string) => Promise<boolean>;
  /** Epoch ms until which entry is throttle-locked (#372); 0 when unlocked. */
  lockedUntil: number;
}

/**
 * The rule for getting out of kid mode, shared by the gate and the crash screen
 * because it was got wrong separately in each (#353, #371). The no-PIN bypass
 * is deliberate: with nothing to verify against a pad would trap whoever holds
 * the iPad, and the route guard already refuses kid mode in that state.
 */
export const usePinExit = (onExit: () => void): PinExit => {
  const [verifying, setVerifying] = useState(false);
  const lockedUntil = useSyncExternalStore(subscribePinThrottle, getPinLockedUntil, () => 0);

  return {
    verifying,
    lockedUntil,
    requestExit: (): void => {
      if (pinGateDisabled() || !hasPin()) {
        onExit();
        return;
      }
      setVerifying(true);
    },
    cancel: (): void => setVerifying(false),
    verify: async (pin: string): Promise<boolean> => {
      // The pad disables its keys while locked; this guard is the backstop
      // for an entry already in flight when the lock engaged.
      if (Date.now() < getPinLockedUntil()) return false;
      const ok = await verifyPin(pin);
      if (ok) {
        resetPinThrottle();
        setVerifying(false);
        onExit();
      } else {
        recordPinFailure();
      }
      return ok;
    },
  };
};
