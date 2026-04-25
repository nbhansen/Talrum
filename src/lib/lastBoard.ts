import type { BoardKind } from '@/types/domain';

const STORAGE_KEY = 'talrum:last-board';
const SESSION_KEY = 'talrum:auto-launched';

interface LastBoard {
  id: string;
  kind: BoardKind;
}

const isBoardKind = (v: unknown): v is BoardKind => v === 'sequence' || v === 'choice';

export const getLastBoard = (): LastBoard | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'id' in parsed &&
      'kind' in parsed &&
      typeof (parsed as { id: unknown }).id === 'string' &&
      isBoardKind((parsed as { kind: unknown }).kind)
    ) {
      return parsed as LastBoard;
    }
    return null;
  } catch {
    return null;
  }
};

export const setLastBoard = (board: LastBoard): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
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

export const kidPathFor = (board: LastBoard): string => `/kid/${board.kind}/${board.id}`;
