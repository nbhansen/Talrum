import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  clearLastBoard,
  getLastBoard,
  hasAutoLaunched,
  kidPathFor,
  markAutoLaunched,
  setLastBoard,
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
    expect(getLastBoard()).toBeNull();
  });

  it('round-trips a board id', () => {
    setLastBoard({ id: 'abc' });
    expect(getLastBoard()).toEqual({ id: 'abc' });
  });

  it('reads only the id of a record that also stores a kind', () => {
    localStorage.setItem('talrum:last-board', JSON.stringify({ id: 'abc', kind: 'choice' }));
    expect(getLastBoard()).toEqual({ id: 'abc' });
  });

  it('returns null on malformed JSON', () => {
    localStorage.setItem('talrum:last-board', '{not json');
    expect(getLastBoard()).toBeNull();
  });

  it('returns null when the stored id is not a string', () => {
    localStorage.setItem('talrum:last-board', JSON.stringify({ id: 7 }));
    expect(getLastBoard()).toBeNull();
  });

  it('clearLastBoard removes the entry', () => {
    setLastBoard({ id: 'a' });
    clearLastBoard();
    expect(getLastBoard()).toBeNull();
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
