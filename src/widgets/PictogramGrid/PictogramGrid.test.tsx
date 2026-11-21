import { fireEvent, render, screen } from '@testing-library/react';
import { type JSX, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { Pictogram } from '@/types/domain';

import { PictogramGrid } from './PictogramGrid';

vi.mock('@/widgets/VoiceRecorderDialog/VoiceRecorderDialog', () => ({
  VoiceRecorderDialog: ({ picto }: { picto: Pictogram }) => <div>Voice for {picto.label}</div>,
}));

const PICTOS: Pictogram[] = [
  { id: 'p1', label: 'Apple', style: 'illus', glyph: 'apple', tint: '#ff0000' },
  { id: 'p2', label: 'Book', style: 'illus', glyph: 'book', tint: '#00ff00' },
];

const Harness = ({
  onTileClick = vi.fn(),
}: {
  onTileClick?: (p: Pictogram) => void;
}): JSX.Element => {
  const [query, setQuery] = useState('');
  return (
    <PictogramGrid
      pictograms={PICTOS}
      query={query}
      onQueryChange={setQuery}
      placeholder="Search"
      tileSize={120}
      onTileClick={onTileClick}
    />
  );
};

const search = (value: string): void => {
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search pictograms' }), {
    target: { value },
  });
};

describe('PictogramGrid', () => {
  it('filters by label, ignoring case', () => {
    render(<Harness />);
    search('APP');
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.queryByText('Book')).not.toBeInTheDocument();
  });

  it('says so when nothing matches the search', () => {
    render(<Harness />);
    search('zebra');
    expect(screen.getByText(/No pictograms match/)).toHaveTextContent('zebra');
  });

  it('says nothing about a search when the library is empty', () => {
    render(
      <PictogramGrid
        pictograms={[]}
        query=""
        onQueryChange={vi.fn()}
        placeholder="Search"
        tileSize={120}
        onTileClick={vi.fn()}
      />,
    );
    expect(screen.queryByText(/No pictograms match/)).not.toBeInTheDocument();
  });

  it('hands the tapped pictogram to the tile handler', () => {
    const onTileClick = vi.fn();
    render(<Harness onTileClick={onTileClick} />);
    fireEvent.click(screen.getByText('Book'));
    expect(onTileClick).toHaveBeenCalledWith(PICTOS[1]);
  });

  it('opens the voice recorder for the tapped pictogram', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Record voice for Apple' }));
    expect(screen.getByText('Voice for Apple')).toBeInTheDocument();
  });
});
