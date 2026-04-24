import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Pictogram } from '@/types/domain';

import { PictoTile } from './PictoTile';

const picto: Pictogram = {
  id: 'apple',
  label: 'Apple',
  style: 'illus',
  glyph: 'apple',
  tint: 'oklch(90% 0.06 90)',
};

describe('PictoTile', () => {
  it('renders as a <button> by default', () => {
    render(<PictoTile picto={picto} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('renders as a <div> with no inner button when as="div"', () => {
    const { container } = render(<PictoTile picto={picto} as="div" />);
    expect(container.querySelector('button')).toBeNull();
    expect(container.firstChild?.nodeName).toBe('DIV');
  });

  it('shows the label when showLabel is not explicitly disabled', () => {
    render(<PictoTile picto={picto} />);
    expect(screen.getByText('Apple')).toBeInTheDocument();
  });
});
