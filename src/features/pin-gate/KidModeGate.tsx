import { type JSX, type ReactNode, useState } from 'react';

import { hasPin, pinGateDisabled, setPin, verifyPin } from '@/lib/pin';
import { Modal } from '@/ui/Modal/Modal';

import { PinPad } from './PinPad';

type Stage =
  | { kind: 'idle' }
  | { kind: 'verify' }
  | { kind: 'setup-new'; firstPin?: string }
  | { kind: 'setup-confirm'; firstPin: string };

interface KidModeGateProps {
  onExitConfirmed: () => void;
  children: (requestExit: () => void) => ReactNode;
}

export const KidModeGate = ({ onExitConfirmed, children }: KidModeGateProps): JSX.Element => {
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
              title="Enter PIN to exit"
              subtitle="Enter your 4-digit parent PIN."
              onSubmit={handleVerify}
              onCancel={close}
            />
          )}
          {stage.kind === 'setup-new' && (
            <PinPad
              title="Set a parent PIN"
              subtitle="Choose a 4-digit PIN for exiting kid mode."
              onSubmit={handleSetupNew}
              onCancel={close}
            />
          )}
          {stage.kind === 'setup-confirm' && (
            <PinPad
              title="Confirm your PIN"
              subtitle="Enter the same 4 digits again."
              onSubmit={handleSetupConfirm}
              onCancel={close}
              errorMessage="PINs don't match"
            />
          )}
        </Modal>
      )}
    </>
  );
};
