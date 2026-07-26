import { type JSX, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getKidCopy } from '@/lib/kidCopy';
import { hasPin, pinGateDisabled, verifyPin } from '@/lib/pin';
import styles from '@/ui/ErrorBoundary/ErrorBoundary.module.css';
import { Modal } from '@/ui/Modal/Modal';

import { PinPad } from './PinPad';

/**
 * What a kid route shows when it throws. Deliberately rendered *outside*
 * KidModeLayout by the router: if the crash came from the layout itself,
 * re-rendering it would re-throw.
 *
 * The screen a child can crash into must obey the same rule as the screen they
 * can't: no route out of kid mode without the PIN (#371). The previous version
 * of this was a single full-screen link to parent home — a crash is exactly
 * when a child taps repeatedly, and it handed them the board builder.
 *
 * So the big obvious action reloads the current URL instead of navigating.
 * That re-enters the same kid route, which #353 made PIN-guarded, and a full
 * reload (rather than the boundary's `reset`) is what actually recovers the
 * common case: a lazy chunk that failed to load, whose rejected promise
 * `React.lazy` caches and re-throws on every subsequent render.
 *
 * The parent's way out is the same one they already know from KidModeGate —
 * same label, same pad, same rules — because trapping a parent in a broken
 * screen is the failure mode that makes people give up on the whole app.
 */
export const KidRouteFallback = (): JSX.Element => {
  const kidCopy = getKidCopy();
  const navigate = useNavigate();
  const [verifying, setVerifying] = useState(false);

  const leaveKidMode = (): void => {
    void navigate('/', { replace: true });
  };

  const requestExit = (): void => {
    // Mirrors KidModeGate: with no PIN stored there is nothing to verify
    // against, so a pad would trap the parent rather than gate anything. No
    // PIN means no kid mode, which is the same answer the route guard gives.
    if (pinGateDisabled() || !hasPin()) {
      leaveKidMode();
      return;
    }
    setVerifying(true);
  };

  const handleVerify = async (pin: string): Promise<boolean> => {
    const ok = await verifyPin(pin);
    if (ok) leaveKidMode();
    return ok;
  };

  return (
    <div role="alert" className={styles.kidFallback}>
      {verifying ? (
        <Modal onClose={() => setVerifying(false)}>
          <PinPad
            title={kidCopy.pin.verifyTitle}
            subtitle={kidCopy.pin.verifySubtitle}
            onSubmit={handleVerify}
            onCancel={() => setVerifying(false)}
            errorMessage={kidCopy.pin.wrongPin}
          />
        </Modal>
      ) : (
        <div className={styles.kidFallbackActions}>
          <button
            type="button"
            className={styles.kidFallbackBtn}
            onClick={() => window.location.reload()}
          >
            {kidCopy.crashRetry}
          </button>
          <button type="button" className={styles.kidFallbackExit} onClick={requestExit}>
            {kidCopy.exitButton}
          </button>
        </div>
      )}
    </div>
  );
};
