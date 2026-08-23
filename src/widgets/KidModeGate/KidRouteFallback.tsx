import type { JSX } from 'react';
import { useNavigate } from 'react-router-dom';

import { getKidCopy } from '@/lib/kidCopy';
import styles from '@/ui/ErrorBoundary/ErrorBoundary.module.css';
import { Modal } from '@/ui/Modal/Modal';

import { PinPad } from './PinPad';
import { usePinExit } from './usePinExit';

/**
 * The crash screen for a kid route, rendered outside KidModeLayout so a crash
 * in the layout cannot re-throw. No route out without the PIN (#371), so the
 * big action reloads the URL rather than navigating — which also recovers the
 * common case, a failed lazy chunk that `React.lazy` caches and re-throws.
 */
export const KidRouteFallback = (): JSX.Element => {
  const kidCopy = getKidCopy();
  const navigate = useNavigate();
  // Parent home, not the builder where the normal exit lands: the board is a
  // plausible cause of the crash and the builder renders the same rows.
  const { verifying, requestExit, cancel, verify, lockedUntil } = usePinExit(() => {
    void navigate('/', { replace: true });
  });

  return (
    <div role="alert" className={styles.kidFallback}>
      {verifying ? (
        <Modal onClose={cancel} size="sm">
          <PinPad
            title={kidCopy.pin.verifyTitle}
            subtitle={kidCopy.pin.verifySubtitle}
            onSubmit={verify}
            onCancel={cancel}
            errorMessage={kidCopy.pin.wrongPin}
            lock={{ until: lockedUntil, message: kidCopy.pin.locked }}
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
