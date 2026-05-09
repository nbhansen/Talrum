import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Pictogram } from '@/types/domain';

const usePictogramsMock = vi.fn<() => { data: Pictogram[] | undefined; isPending: boolean }>();

vi.mock('@/lib/queries/pictograms', () => ({
  usePictograms: () => usePictogramsMock(),
}));

vi.mock('@/ui/PictogramSheet/PictogramSheet', () => ({
  PictogramSheet: ({ picto, onClose }: { picto: Pictogram; onClose: () => void }) => (
    <div data-testid="picto-sheet">
      <span>Editing {picto.label}</span>
      <button type="button" onClick={onClose}>
        close-sheet
      </button>
    </div>
  ),
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

  it('filters tiles by the search query (case-insensitive)', () => {
    usePictogramsMock.mockReturnValue({ data: PICTOS, isPending: false });
    render(<Library />);
    fireEvent.change(screen.getByRole('searchbox', { name: /search pictograms/i }), {
      target: { value: 'app' },
    });
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.queryByText('Book')).toBeNull();
  });

  it('opens the edit sheet when a tile is clicked and closes when dismissed', () => {
    usePictogramsMock.mockReturnValue({ data: PICTOS, isPending: false });
    render(<Library />);
    expect(screen.queryByTestId('picto-sheet')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /apple/i }));
    expect(screen.getByTestId('picto-sheet')).toBeInTheDocument();
    expect(screen.getByText(/editing apple/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /close-sheet/i }));
    expect(screen.queryByTestId('picto-sheet')).toBeNull();
  });
});
