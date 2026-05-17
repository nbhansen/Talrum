import { describe, expect, it } from 'vitest';

import { accentForIndex, cssVar, inkForAccent, spaceVar } from './tokens';

describe('cssVar', () => {
  it('wraps a color token in a CSS var reference', () => {
    expect(cssVar('sage')).toBe('var(--tal-sage)');
    expect(cssVar('ink-muted')).toBe('var(--tal-ink-muted)');
  });
});

describe('spaceVar', () => {
  it('wraps a space token in a CSS var reference', () => {
    expect(spaceVar('3')).toBe('var(--tal-space-3)');
    expect(spaceVar('12')).toBe('var(--tal-space-12)');
  });
});

describe('accentForIndex', () => {
  it('cycles through the five accent pairs', () => {
    expect(accentForIndex(0)).toEqual({ bg: 'sage', ink: 'sage-ink' });
    expect(accentForIndex(1)).toEqual({ bg: 'sky', ink: 'sky-ink' });
    expect(accentForIndex(2)).toEqual({ bg: 'peach', ink: 'peach-ink' });
    expect(accentForIndex(5)).toEqual(accentForIndex(0));
  });
});

describe('inkForAccent', () => {
  it.each([
    ['sage', 'sage-ink'],
    ['sky', 'sky-ink'],
    ['peach', 'peach-ink'],
    ['lavender', 'lavender-ink'],
    ['sun', 'sun-ink'],
  ] as const)('maps %s → %s', (bg, ink) => {
    expect(inkForAccent(bg)).toBe(ink);
  });
});
