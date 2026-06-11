import { describe, expect, it } from 'vitest';

import { noteBoardUpdatedAt, resolveExpectedUpdatedAt } from './board-clock';

// PostgREST renders timestamptz with microsecond precision. These three are
// inside the same millisecond — exactly where a Date.parse comparison
// collapses them to "equal" and ordering silently degrades to last-call-wins.
const EARLY = '2026-06-11T10:00:00.000001+00:00';
const LATE = '2026-06-11T10:00:00.000999+00:00';
const T_NEXT = '2026-06-11T10:00:01.000001+00:00';

describe('board-clock ordering', () => {
  it('resolve returns the baseline untouched when nothing was noted', () => {
    expect(resolveExpectedUpdatedAt('b-1', EARLY)).toBe(EARLY);
  });

  it('never invents a guard for an undefined baseline', () => {
    noteBoardUpdatedAt('b-1', LATE);
    expect(resolveExpectedUpdatedAt('b-1', undefined)).toBeUndefined();
  });

  it('substitutes a newer noted value for a stale baseline', () => {
    noteBoardUpdatedAt('b-1', T_NEXT);
    expect(resolveExpectedUpdatedAt('b-1', EARLY)).toBe(T_NEXT);
  });

  it('does not drag the guard backwards within the same millisecond', () => {
    // The noted value and the baseline differ only in microseconds. The
    // guard must use the newer baseline — handing back the older noted
    // value would make the conditional update miss and cry conflict.
    noteBoardUpdatedAt('b-1', EARLY);
    expect(resolveExpectedUpdatedAt('b-1', LATE)).toBe(LATE);
  });

  it('keeps the newer value when a stale note arrives within the same millisecond', () => {
    // Out-of-order response observation: the write that produced LATE
    // reports after the one that produced EARLY. The clock must not move
    // backwards just because the stale note came last.
    noteBoardUpdatedAt('b-1', LATE);
    noteBoardUpdatedAt('b-1', EARLY);
    expect(resolveExpectedUpdatedAt('b-1', '2026-06-11T09:00:00.000001+00:00')).toBe(LATE);
  });
});
