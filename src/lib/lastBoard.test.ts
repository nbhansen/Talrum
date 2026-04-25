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

  it('round-trips a sequence board', () => {
    setLastBoard({ id: 'abc', kind: 'sequence' });
    expect(getLastBoard()).toEqual({ id: 'abc', kind: 'sequence' });
  });

  it('round-trips a choice board', () => {
    setLastBoard({ id: 'xyz', kind: 'choice' });
    expect(getLastBoard()).toEqual({ id: 'xyz', kind: 'choice' });
  });

  it('returns null on malformed JSON', () => {
    localStorage.setItem('talrum:last-board', '{not json');
    expect(getLastBoard()).toBeNull();
  });

  it('returns null when stored kind is unknown', () => {
    localStorage.setItem('talrum:last-board', JSON.stringify({ id: 'a', kind: 'unknown' }));
    expect(getLastBoard()).toBeNull();
  });

  it('clearLastBoard removes the entry', () => {
    setLastBoard({ id: 'a', kind: 'sequence' });
    clearLastBoard();
    expect(getLastBoard()).toBeNull();
  });

  it('auto-launch flag flips after marking', () => {
    expect(hasAutoLaunched()).toBe(false);
    markAutoLaunched();
    expect(hasAutoLaunched()).toBe(true);
  });

  it('kidPathFor builds the correct route', () => {
    expect(kidPathFor({ id: 'b1', kind: 'sequence' })).toBe('/kid/sequence/b1');
    expect(kidPathFor({ id: 'b2', kind: 'choice' })).toBe('/kid/choice/b2');
  });
});
