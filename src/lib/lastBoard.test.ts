import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  clearLastBoard,
  getLastBoardId,
  hasAutoLaunched,
  kidPathFor,
  markAutoLaunched,
  setLastBoardId,
} from './lastBoard';

describe('lastBoard', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns null when nothing is stored', () => {
    expect(getLastBoardId()).toBeNull();
  });

  it('round-trips a board id', () => {
    setLastBoardId('abc');
    expect(getLastBoardId()).toBe('abc');
  });

  it('clearLastBoard removes the entry', () => {
    setLastBoardId('a');
    clearLastBoard();
    expect(getLastBoardId()).toBeNull();
  });

  it('auto-launch flag flips after marking', () => {
    expect(hasAutoLaunched()).toBe(false);
    markAutoLaunched();
    expect(hasAutoLaunched()).toBe(true);
  });

  it('kidPathFor builds the correct route', () => {
    expect(kidPathFor('b1')).toBe('/kid/b1');
  });
});
