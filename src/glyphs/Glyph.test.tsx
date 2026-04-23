import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { GlyphName } from '@/types/domain';

import { Glyph } from './Glyph';

const ALL_GLYPHS: readonly GlyphName[] = [
  'apple',
  'bag',
  'bath',
  'bed',
  'book',
  'bowl',
  'brush',
  'car',
  'check',
  'cup',
  'heart',
  'park',
  'play',
  'shirt',
  'shoe',
  'store',
  'sun',
  'swing',
  'tooth',
  'zoo',
];

describe('Glyph', () => {
  it('renders every glyph name in the union', () => {
    for (const name of ALL_GLYPHS) {
      const { container, unmount } = render(<Glyph name={name} />);
      const svg = container.querySelector('svg');
      expect(svg, `expected svg for ${name}`).not.toBeNull();
      expect(svg?.querySelector('g'), `expected group for ${name}`).not.toBeNull();
      unmount();
    }
  });

  it('applies the requested size', () => {
    const { container } = render(<Glyph name="sun" size={120} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('120');
    expect(svg?.getAttribute('height')).toBe('120');
  });
});
