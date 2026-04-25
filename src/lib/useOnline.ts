import { useEffect, useState } from 'react';

/**
 * Tracks `navigator.onLine`. Updates via the `online`/`offline` window
 * events. Used by the login + auth-error screens to swap a generic spinner
 * for a clearer "you're offline" message — sign-in fundamentally needs
 * network, but the rest of the app doesn't.
 */
export const useOnline = (): boolean => {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  useEffect(() => {
    const up = (): void => setOnline(true);
    const down = (): void => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
};
