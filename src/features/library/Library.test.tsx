import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Pictogram } from '@/types/domain';

const usePictogramsMock = vi.fn<() => { data: Pictogram[] | undefined; isPending: boolean }>();

vi.mock('@/lib/queries/pictograms', () => ({
  usePictograms: () => usePictogramsMock(),
}));

const { Library } = await import('./Library');

const PICTOS: Pictogram[] = [
  { id: 'p1', label: 'Apple', style: 'illus', glyph: 'apple', tint: '#ff0000' },
  { id: 'p2', label: 'Book', style: 'illus', glyph: 'book', tint: '#00ff00' },
];

describe('Library', () => {
  it('renders every pictogram from the cache', () => {
    usePictogramsMock.mockReturnValue({ data: PICTOS, isPending: false });
    render(<Library />);
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.getByText('Book')).toBeInTheDocument();
  });

  it('shows the empty state when no pictograms exist', () => {
    usePictogramsMock.mockReturnValue({ data: [], isPending: false });
    render(<Library />);
    expect(screen.getByRole('heading', { name: /no pictograms yet/i })).toBeInTheDocument();
  });
});
