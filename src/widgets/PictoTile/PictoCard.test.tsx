import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Pictogram } from '@/types/domain';

import { PictoCard } from './PictoCard';

const park: Pictogram = { id: 'p', label: 'Park', style: 'photo', imagePath: 'stock:park' };

describe('PictoCard photo alt text (#729)', () => {
  it('has empty alt text when the label shows', () => {
    render(<PictoCard picto={park} size={140} />);
    expect(screen.getByText('Park')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Park' })).toBeNull();
  });

  it('names the photo when the label is hidden', () => {
    render(<PictoCard picto={park} size={140} showLabel={false} />);
    expect(screen.getByRole('img', { name: 'Park' })).toBeInTheDocument();
  });
});

describe('PictoCard', () => {
  it('renders without a button so it can sit inside an interactive ancestor', () => {
    render(<PictoCard picto={park} size={140} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('hides the label when showLabel is false', () => {
    render(<PictoCard picto={park} size={140} showLabel={false} />);
    expect(screen.queryByText('Park')).not.toBeInTheDocument();
  });
});
