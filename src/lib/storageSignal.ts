export interface StorageSignal {
  subscribe: (cb: () => void) => () => void;
  notify: () => void;
}

/** For useSyncExternalStore over one localStorage key. Other tabs arrive via `storage`. */
export const storageSignal = (key: string): StorageSignal => {
  const listeners = new Set<() => void>();
  return {
    subscribe: (cb) => {
      listeners.add(cb);
      const onStorage = (event: StorageEvent): void => {
        if (event.key === key || event.key === null) cb();
      };
      window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(cb);
        window.removeEventListener('storage', onStorage);
      };
    },
    notify: () => {
      for (const cb of listeners) cb();
    },
  };
};
