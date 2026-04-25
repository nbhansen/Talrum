import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Pictogram } from '@/types/domain';

import { PictoCard } from './PictoCard';
import { PictoTile } from './PictoTile';

const picto: Pictogram = {
  id: 'apple',
  label: 'Apple',
  style: 'illus',
  glyph: 'apple',
  tint: 'oklch(90% 0.06 90)',
};

describe('PictoTile', () => {
  it('renders a <button> wrapping the card', () => {
    render(<PictoTile picto={picto} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('shows the label by default', () => {
    render(<PictoTile picto={picto} />);
    expect(screen.getByText('Apple')).toBeInTheDocument();
  });

  it('fires onClick when tapped', async () => {
    const onClick = vi.fn();
    render(<PictoTile picto={picto} onClick={onClick} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('PictoCard', () => {
  it('renders without a button so it can sit inside an interactive ancestor', () => {
    const { container } = render(<PictoCard picto={picto} />);
    expect(container.querySelector('button')).toBeNull();
    expect(container.firstChild?.nodeName).toBe('DIV');
  });

  it('hides the label when showLabel is false', () => {
    render(<PictoCard picto={picto} showLabel={false} />);
    expect(screen.queryByText('Apple')).not.toBeInTheDocument();
  });
});
