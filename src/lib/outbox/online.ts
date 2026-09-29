export const isOnline = (): boolean => typeof navigator === 'undefined' || navigator.onLine;
