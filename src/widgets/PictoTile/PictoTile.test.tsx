import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

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
  it('shows the label', () => {
    render(<PictoTile picto={picto} size={140} onClick={vi.fn()} />);
    expect(screen.getByText('Apple')).toBeInTheDocument();
  });

  it('fires onClick when tapped', async () => {
    const onClick = vi.fn();
    render(<PictoTile picto={picto} size={140} onClick={onClick} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
