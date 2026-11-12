import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Pictogram } from '@/types/domain';

import { PictoCard } from './PictoCard';

const park: Pictogram = { id: 'p', label: 'Park', style: 'photo', imagePath: 'stock:park' };

describe('PictoCard photo alt text (#729)', () => {
  it('has empty alt text when the label shows', () => {
    render(<PictoCard picto={park} />);
    expect(screen.getByText('Park')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Park' })).toBeNull();
  });

  it('names the photo when the label is hidden', () => {
    render(<PictoCard picto={park} showLabel={false} />);
    expect(screen.getByRole('img', { name: 'Park' })).toBeInTheDocument();
  });
});
