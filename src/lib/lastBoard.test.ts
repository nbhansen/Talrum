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

  it('stores the id in a JSON record, the format that devices already hold', () => {
    setLastBoardId('abc');
    expect(localStorage.getItem('talrum:last-board')).toBe(JSON.stringify({ id: 'abc' }));
  });

  it('reads only the id of a record that also stores a kind', () => {
    localStorage.setItem('talrum:last-board', JSON.stringify({ id: 'abc', kind: 'choice' }));
    expect(getLastBoardId()).toBe('abc');
  });

  it('returns null on malformed JSON', () => {
    localStorage.setItem('talrum:last-board', '{not json');
    expect(getLastBoardId()).toBeNull();
  });

  it('returns null when the stored id is not a string', () => {
    localStorage.setItem('talrum:last-board', JSON.stringify({ id: 7 }));
    expect(getLastBoardId()).toBeNull();
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
