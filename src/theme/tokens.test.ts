import { describe, expect, it } from 'vitest';

import { accentForIndex, cssVar, inkForAccent } from './tokens';

describe('cssVar', () => {
  it('wraps a color token in a CSS var reference', () => {
    expect(cssVar('sage')).toBe('var(--tal-sage)');
    expect(cssVar('ink-muted')).toBe('var(--tal-ink-muted)');
  });
});

describe('accentForIndex', () => {
  it('cycles through the five accents', () => {
    expect(accentForIndex(0)).toBe('sage');
    expect(accentForIndex(1)).toBe('sky');
    expect(accentForIndex(2)).toBe('peach');
    expect(accentForIndex(5)).toBe(accentForIndex(0));
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
