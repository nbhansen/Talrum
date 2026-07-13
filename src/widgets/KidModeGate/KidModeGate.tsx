import { type JSX, type ReactNode, useState } from 'react';

import { getKidCopy } from '@/lib/kidCopy';
import { hasPin, pinGateDisabled, setPin, verifyPin } from '@/lib/pin';
import { Modal } from '@/ui/Modal/Modal';

import { PinPad } from './PinPad';

/**
 * The gate's modal flow. From 'idle', requestExit branches on whether a
 * device PIN exists: 'verify' (one correct entry exits) or first-time setup,
 * which is two steps — 'setup-new' captures a PIN, 'setup-confirm' makes the
 * parent re-enter it before storing the hash. Setup deliberately skips any
 * existing-PIN verification: there is nothing to verify against yet, and the
 * confirm step is what protects against a typo'd PIN locking the device.
 * Cancelling at any step returns to 'idle' without storing anything.
 */
type Stage =
  | { kind: 'idle' }
  | { kind: 'verify' }
  | { kind: 'setup-new' }
  | { kind: 'setup-confirm'; firstPin: string };

interface KidModeGateProps {
  onExitConfirmed: () => void;
  children: (requestExit: () => void) => ReactNode;
}

export const KidModeGate = ({ onExitConfirmed, children }: KidModeGateProps): JSX.Element => {
  const kidCopy = getKidCopy();
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });

  const requestExit = (): void => {
    if (pinGateDisabled()) {
      onExitConfirmed();
      return;
    }
    setStage(hasPin() ? { kind: 'verify' } : { kind: 'setup-new' });
  };

  const close = (): void => setStage({ kind: 'idle' });

  const handleVerify = async (pin: string): Promise<boolean> => {
    const ok = await verifyPin(pin);
    if (ok) {
      close();
      onExitConfirmed();
    }
    return ok;
  };

  const handleSetupNew = async (pin: string): Promise<boolean> => {
    setStage({ kind: 'setup-confirm', firstPin: pin });
    return true;
  };

  const handleSetupConfirm = async (pin: string): Promise<boolean> => {
    if (stage.kind !== 'setup-confirm' || pin !== stage.firstPin) return false;
    await setPin(pin);
    close();
    onExitConfirmed();
    return true;
  };

  return (
    <>
      {children(requestExit)}
      {stage.kind !== 'idle' && (
        <Modal onClose={close}>
          {stage.kind === 'verify' && (
            <PinPad
              title={kidCopy.pin.verifyTitle}
              subtitle={kidCopy.pin.verifySubtitle}
              onSubmit={handleVerify}
              onCancel={close}
              errorMessage={kidCopy.pin.wrongPin}
            />
          )}
          {stage.kind === 'setup-new' && (
            <PinPad
              title={kidCopy.pin.setupNewTitle}
              subtitle={kidCopy.pin.setupNewSubtitle}
              onSubmit={handleSetupNew}
              onCancel={close}
            />
          )}
          {stage.kind === 'setup-confirm' && (
            <PinPad
              title={kidCopy.pin.setupConfirmTitle}
              subtitle={kidCopy.pin.setupConfirmSubtitle}
              onSubmit={handleSetupConfirm}
              onCancel={close}
              errorMessage={kidCopy.pin.mismatchError}
            />
          )}
        </Modal>
      )}
    </>
  );
};
