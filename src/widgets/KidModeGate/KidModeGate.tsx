import { type JSX, type ReactNode, useState } from 'react';

import { getKidCopy } from '@/lib/kidCopy';
import { hasPin, pinGateDisabled, verifyPin } from '@/lib/pin';
import { Modal } from '@/ui/Modal/Modal';

import { PinPad } from './PinPad';

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
 */
export const KidModeGate = ({ onExitConfirmed, children }: KidModeGateProps): JSX.Element => {
  const kidCopy = getKidCopy();
  const [verifying, setVerifying] = useState(false);

  const requestExit = (): void => {
    // With no PIN there is nothing to verify against. The kid routes stop kid
    // mode being entered in that state, but it is still reachable by clearing
    // the PIN in another tab while this one sits in kid mode. Opening a PIN pad
    // that no entry can satisfy would trap the parent, so let them out — the
    // same answer the route guard gives: no PIN means no kid mode.
    if (pinGateDisabled() || !hasPin()) {
      onExitConfirmed();
      return;
    }
    setVerifying(true);
  };

  const close = (): void => setVerifying(false);

  const handleVerify = async (pin: string): Promise<boolean> => {
    const ok = await verifyPin(pin);
    if (ok) {
      close();
      onExitConfirmed();
    }
    return ok;
  };

  return (
    <>
      {children(requestExit)}
      {verifying && (
        <Modal onClose={close}>
          <PinPad
            title={kidCopy.pin.verifyTitle}
            subtitle={kidCopy.pin.verifySubtitle}
            onSubmit={handleVerify}
            onCancel={close}
            errorMessage={kidCopy.pin.wrongPin}
          />
        </Modal>
      )}
    </>
  );
};
