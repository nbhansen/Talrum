import type { JSX } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

import styles from './SwUpdatePrompt.module.css';

/**
 * Renders nothing while the SW is current. When the build pipeline ships a new
 * SW, Workbox flips `needRefresh` and we show a tiny banner; clicking "Reload"
 * activates the waiting SW and reloads the page so the user picks up the new
 * bundle deterministically (we use `registerType: 'prompt'`, not auto-update).
 */
export const SwUpdatePrompt = (): JSX.Element | null => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error('Service worker registration failed', error);
    },
  });

  if (!needRefresh) return null;
  return (
    <div role="status" className={styles.banner}>
      <span className={styles.label}>New version available</span>
      <button
        type="button"
        className={styles.reload}
        onClick={() => void updateServiceWorker(true)}
      >
        Reload
      </button>
      <button
        type="button"
        className={styles.dismiss}
        aria-label="Dismiss"
        onClick={() => setNeedRefresh(false)}
      >
        ×
      </button>
    </div>
  );
};
