import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { TestProviders } from '@/lib/queries/queries.test-utils';
import type { Pictogram } from '@/types/domain';

import { LibraryRoute } from './LibraryRoute';

vi.mock('@/lib/queries/pictograms', () => ({
  usePictograms: (): { data: Pictogram[]; isPending: boolean } => ({
    data: [{ id: 'p1', label: 'Apple', style: 'illus', glyph: 'apple', tint: '#ff0000' }],
    isPending: false,
  }),
  // NewPictogramModal renders the upload flow, which needs the add hook.
  useAddPhotoPictogram: (): { add: () => Promise<void>; isPending: boolean } => ({
    add: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('@/lib/queries/boards', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, useBoards: () => ({ data: [], isPending: false }) };
});

const renderRoute = (): void => {
  render(
    <TestProviders>
      <MemoryRouter initialEntries={['/library']}>
        <Routes>
          <Route path="/library" element={<LibraryRoute />} />
        </Routes>
      </MemoryRouter>
    </TestProviders>,
  );
};

describe('LibraryRoute', () => {
  it('renders the Library shell with pictograms from the cache', () => {
    renderRoute();
    expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument();
    expect(screen.getByText('Apple')).toBeInTheDocument();
  });

  it('New pictogram opens the upload modal and Close dismisses it (#339)', async () => {
    renderRoute();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /new pictogram/i }));

    expect(screen.getByRole('dialog', { name: /new pictogram/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^close$/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
