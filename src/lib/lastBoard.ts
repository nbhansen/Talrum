const STORAGE_KEY = 'talrum:last-board';
const SESSION_KEY = 'talrum:auto-launched';

export const getLastBoardId = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

export const setLastBoardId = (id: string): void => {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore quota / privacy mode errors — feature is best-effort
  }
};

export const clearLastBoard = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};

/** For a board that is going away: drop the pointer only if it names that board. */
export const forgetLastBoard = (boardId: string): void => {
  if (getLastBoardId() === boardId) clearLastBoard();
};

export const hasAutoLaunched = (): boolean => {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return true;
  }
};

export const markAutoLaunched = (): void => {
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // ignore
  }
};

export const kidPathFor = (boardId: string): string => `/kid/${boardId}`;
