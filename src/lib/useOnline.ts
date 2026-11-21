import { useEffect, useState } from 'react';

/** Tracks `navigator.onLine` through the `online`/`offline` window events. */
export const useOnline = (): boolean => {
  const [online, setOnline] = useState(() => navigator.onLine);
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
