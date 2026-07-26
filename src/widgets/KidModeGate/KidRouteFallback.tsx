import type { JSX } from 'react';
import { useNavigate } from 'react-router-dom';

import { getKidCopy } from '@/lib/kidCopy';
import styles from '@/ui/ErrorBoundary/ErrorBoundary.module.css';
import { Modal } from '@/ui/Modal/Modal';

import { PinPad } from './PinPad';
import { usePinExit } from './usePinExit';

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
 * same label, same pad, same `usePinExit` rules — because trapping a parent in
 * a broken screen is the failure mode that makes people give up on the app.
 */
export const KidRouteFallback = (): JSX.Element => {
  const kidCopy = getKidCopy();
  const navigate = useNavigate();
  // Parent home, not `/boards/:boardId/edit` where the normal exit lands. The
  // board is a plausible cause of the crash, and the builder renders the same
  // rows — a crash that repeats on the way out of a crash is worse than
  // landing somewhere neutral. Parent home is also where the parent-route
  // fallback sends people, for the same reason.
  const { verifying, requestExit, cancel, verify } = usePinExit(() => {
    void navigate('/', { replace: true });
  });

  return (
    <div role="alert" className={styles.kidFallback}>
      {verifying ? (
        <Modal onClose={cancel}>
          <PinPad
            title={kidCopy.pin.verifyTitle}
            subtitle={kidCopy.pin.verifySubtitle}
            onSubmit={verify}
            onCancel={cancel}
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
