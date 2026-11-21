const STORAGE_KEY = 'talrum:last-board';
const SESSION_KEY = 'talrum:auto-launched';

// Stored as a `{ id }` JSON record: devices already hold that format.
export const getLastBoardId = (): string | null => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (typeof parsed !== 'object' || parsed === null || !('id' in parsed)) return null;
    return typeof parsed.id === 'string' ? parsed.id : null;
  } catch {
    return null;
  }
};

export const setLastBoardId = (id: string): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ id }));
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
