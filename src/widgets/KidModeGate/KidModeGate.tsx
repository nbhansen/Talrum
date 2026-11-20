import type { JSX, ReactNode } from 'react';

import { PinExitDialog } from './PinExitDialog';
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
  const exit = usePinExit(onExitConfirmed);
  return (
    <>
      {children(exit.requestExit)}
      <PinExitDialog exit={exit} />
    </>
  );
};
