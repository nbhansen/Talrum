import { describe, expect, it } from 'vitest';

import { slugifyLabel } from './image';

describe('slugifyLabel', () => {
  it('lowercases and replaces whitespace with dashes', () => {
    expect(slugifyLabel('Cereal Bowl')).toBe('cereal-bowl');
  });

  it('strips punctuation and collapses runs of separators', () => {
    expect(slugifyLabel("Liam's  lunch!!")).toBe('liam-s-lunch');
  });

  it('trims leading and trailing dashes', () => {
    expect(slugifyLabel('--hello--')).toBe('hello');
  });

  it('falls back to "photo" when the label has no usable characters', () => {
    expect(slugifyLabel('   ')).toBe('photo');
    expect(slugifyLabel('!!!')).toBe('photo');
  });
});
