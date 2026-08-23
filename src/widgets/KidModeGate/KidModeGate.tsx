import type { JSX, ReactNode } from 'react';

import { getKidCopy } from '@/lib/kidCopy';
import { Modal } from '@/ui/Modal/Modal';

import { PIN_PAD_TITLE_ID, PinPad } from './PinPad';
import { usePinExit } from './usePinExit';

interface KidModeGateProps {
  onExitConfirmed: () => void;
  children: (requestExit: () => void) => ReactNode;
}

/**
 * Gates a kid screen's exit behind the device PIN. The gate never *creates*
 * one: it used to, so a child could set 1111 and walk into the builder (#353).
 * PINs are set only in Settings, and the kid routes refuse to render without
 * one. When to ask lives in `usePinExit`, shared with the crash screen (#371).
 */
export const KidModeGate = ({ onExitConfirmed, children }: KidModeGateProps): JSX.Element => {
  const kidCopy = getKidCopy();
  const { verifying, requestExit, cancel, verify, lockedUntil } = usePinExit(onExitConfirmed);

  return (
    <>
      {children(requestExit)}
      {verifying && (
        <Modal onClose={cancel} labelledBy={PIN_PAD_TITLE_ID} size="sm">
          <PinPad
            title={kidCopy.pin.verifyTitle}
            subtitle={kidCopy.pin.verifySubtitle}
            onSubmit={verify}
            onCancel={cancel}
            errorMessage={kidCopy.pin.wrongPin}
            lock={{ until: lockedUntil, message: kidCopy.pin.locked }}
          />
        </Modal>
      )}
    </>
  );
};
