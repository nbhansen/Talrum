import type { JSX, ReactNode } from 'react';

import { getKidCopy } from '@/lib/kidCopy';
import { Modal } from '@/ui/Modal/Modal';

import { PinPad } from './PinPad';
import { usePinExit } from './usePinExit';

interface KidModeGateProps {
  onExitConfirmed: () => void;
  children: (requestExit: () => void) => ReactNode;
}

/**
 * Wraps a kid-mode screen and gates its exit behind the device PIN:
 * `children(requestExit)` renders the kid screen and hands it an exit trigger,
 * which opens a PinPad. One correct entry confirms the exit.
 *
 * The gate never *creates* a PIN. It used to: with no PIN stored, the first
 * exit tap opened a two-step setup flow, so a child could choose 1111, confirm
 * it, and land in the board builder (#353). A gate that hands out keys to
 * whoever asks first is not a gate. PINs are now set only in parent UI
 * (Settings → Parent PIN), and the kid routes refuse to render without one, so
 * verification is the only flow left here.
 *
 * When to ask, and when to let someone straight out, lives in `usePinExit` —
 * shared with the crash-screen fallback, which needs the identical rule (#371).
 */
export const KidModeGate = ({ onExitConfirmed, children }: KidModeGateProps): JSX.Element => {
  const kidCopy = getKidCopy();
  const { verifying, requestExit, cancel, verify } = usePinExit(onExitConfirmed);

  return (
    <>
      {children(requestExit)}
      {verifying && (
        <Modal onClose={cancel}>
          <PinPad
            title={kidCopy.pin.verifyTitle}
            subtitle={kidCopy.pin.verifySubtitle}
            onSubmit={verify}
            onCancel={cancel}
            errorMessage={kidCopy.pin.wrongPin}
          />
        </Modal>
      )}
    </>
  );
};
