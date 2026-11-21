import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeBoard, TestProviders } from '@/lib/queries/queries.test-utils';
import type { Board, Kid } from '@/types/domain';

import { KidsRoute } from './KidsRoute';

const useBoardsMock = vi.fn(() => ({ data: [] as Board[], isPending: false }));

const KID: Kid = { id: 'k1', ownerId: 'owner', name: 'Liam' };

vi.mock('@/lib/queries/kids', () => ({
  useKids: (): { data: Kid[]; isPending: boolean } => ({
    data: [KID],
    isPending: false,
  }),
  useCreateKid: () => ({ mutate: vi.fn(), isPending: false }),
  useActiveKid: () => KID,
  useRenameKid: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteKid: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/lib/queries/boards', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, useBoards: () => useBoardsMock() };
});

const renderRoute = (): void => {
  render(
    <TestProviders>
      <MemoryRouter initialEntries={['/kids']}>
        <Routes>
          <Route path="/kids" element={<KidsRoute />} />
          <Route path="/kid/:boardId" element={<div data-testid="kid-sequence-route" />} />
        </Routes>
      </MemoryRouter>
    </TestProviders>,
  );
};

beforeEach(() => {
  useBoardsMock.mockReset();
  useBoardsMock.mockReturnValue({ data: [], isPending: false });
});

describe('KidsRoute', () => {
  it('renders the Kids shell with rows from the cache', () => {
    renderRoute();
    expect(screen.getByRole('heading', { name: 'Kids' })).toBeInTheDocument();
    expect(screen.getByText('Liam')).toBeInTheDocument();
  });

  it('clicking the header New kid opens the modal', async () => {
    renderRoute();
    expect(screen.queryByRole('heading', { name: /new kid/i })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /new kid/i }));

    expect(screen.getByRole('heading', { name: /new kid/i })).toBeInTheDocument();
  });

  it('clicking KID navigates into the most recent non-empty board (regression: #71, #301)', async () => {
    useBoardsMock.mockReturnValue({
      data: [makeBoard({ id: 'b-seq', kidId: 'k1', stepIds: ['p1'] })],
      isPending: false,
    });
    renderRoute();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^kid$/i }));

    expect(screen.getByTestId('kid-sequence-route')).toBeInTheDocument();
  });
});
