import type { JSX } from 'react';

import { getKidCopy } from '@/lib/kidCopy';
import { Modal } from '@/ui/Modal/Modal';
import { PinPad } from '@/widgets/PinPad/PinPad';

import type { PinExit } from './usePinExit';

export const PinExitDialog = ({ exit }: { exit: PinExit }): JSX.Element | null => {
  if (!exit.verifying) return null;
  const kidCopy = getKidCopy();
  return (
    <Modal onClose={exit.cancel} size="sm">
      <PinPad
        title={kidCopy.pin.verifyTitle}
        subtitle={kidCopy.pin.verifySubtitle}
        onSubmit={exit.verify}
        errorMessage={kidCopy.pin.wrongPin}
        lock={{ until: exit.lockedUntil, message: kidCopy.pin.locked }}
      />
    </Modal>
  );
};
