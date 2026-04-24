import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { JSX } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { boardsQueryKey } from '@/lib/queries/boards';

const singleMock = vi.fn();
const eqMock = vi.fn(() => ({ single: singleMock }));
const selectMock = vi.fn(() => ({ eq: eqMock, order: vi.fn(() => Promise.resolve({ data: [], error: null })) }));
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
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/boards/:boardId/edit" element={<BoardBuilderRoute />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('BoardBuilderRoute', () => {
  it('renders BoardNotFound when useBoard errors (RLS-blocked row)', async () => {
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
    expect(screen.getByText('Back to boards')).toBeInTheDocument();
  });
});
