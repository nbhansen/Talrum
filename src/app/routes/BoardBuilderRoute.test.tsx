import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { TestSessionProvider } from '@/lib/auth/session.test-utils';
import { boardQueryKey, boardsQueryKey } from '@/lib/queries/boards';
import type { Board } from '@/types/domain';

const singleMock = vi.fn();
const eqMock = vi.fn(() => ({ single: singleMock }));
const selectMock = vi.fn(() => ({
  eq: eqMock,
  order: vi.fn(() => Promise.resolve({ data: [], error: null })),
}));
const fromMock = vi.fn((_table: string) => ({ select: selectMock }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => fromMock(table),
    auth: {
      signOut: vi.fn(),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

const { BoardBuilderRoute } = await import('./BoardBuilderRoute');

const makeWrapper = (qc: QueryClient, initialPath: string): (() => JSX.Element) => {
  return (): JSX.Element => (
    <TestSessionProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route
              path="/boards/:boardId/edit"
              element={
                <>
                  <Link to="/boards/board-b/edit">Go to B</Link>
                  <BoardBuilderRoute />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </TestSessionProvider>
  );
};

describe('BoardBuilderRoute', () => {
  it('renders the not-found variant when useBoard hits PGRST116 (RLS-hidden row)', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(boardsQueryKey, []);
    singleMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' },
    });
    const Wrap = makeWrapper(qc, '/boards/00000000-0000-0000-0000-000000000000/edit');
    render(<Wrap />);
    await waitFor(() => {
      expect(screen.getByText('Board not found')).toBeInTheDocument();
    });
    // Retrying a 404 is pointless.
    expect(screen.queryByText('Retry')).not.toBeInTheDocument();
  });

  it('renders the error variant with Retry for non-PGRST116 errors', async () => {
    // useBoard retries a non-PGRST116 error 3× with backoff, so the delay is
    // zeroed and the mock persists across attempts.
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, retryDelay: 0 } },
    });
    qc.setQueryData(boardsQueryKey, []);
    singleMock.mockResolvedValue({
      data: null,
      error: { message: 'network error', code: 'NETWORK' },
    });
    const Wrap = makeWrapper(qc, '/boards/00000000-0000-0000-0000-000000000000/edit');
    render(<Wrap />);
    await waitFor(
      () => {
        expect(screen.getByText('Could not load board')).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('shows the new board name after navigating from one board to another', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    const board = (id: string, name: string): Board => ({
      id,
      ownerId: 'owner-1',
      kidId: 'kid-1',
      name,
      kind: 'sequence',
      labelsVisible: true,
      voiceMode: 'tts',
      stepIds: [],
      kidReorderable: false,
      accent: 'peach',
      updatedLabel: 'Edited just now',
    });
    qc.setQueryData(boardQueryKey('board-a'), board('board-a', 'Morning'));
    qc.setQueryData(boardQueryKey('board-b'), board('board-b', 'Bedtime'));
    const Wrap = makeWrapper(qc, '/boards/board-a/edit');
    render(<Wrap />);
    expect(await screen.findByDisplayValue('Morning')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Go to B' }));

    expect(await screen.findByDisplayValue('Bedtime')).toBeInTheDocument();
  });
});
