import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TestSessionProvider } from '@/lib/auth/session.test-utils';
import type { Board, Pictogram } from '@/types/domain';

const useBoardsMock = vi.fn(() => ({ data: [] as Board[], isPending: false }));

vi.mock('@/lib/queries/pictograms', () => ({
  usePictograms: (): { data: Pictogram[]; isPending: boolean } => ({
    data: [{ id: 'p1', label: 'Apple', style: 'illus', glyph: 'apple', tint: '#ff0000' }],
    isPending: false,
  }),
}));

vi.mock('@/lib/queries/boards', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, useBoards: () => useBoardsMock() };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signOut: vi.fn(),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

const { LibraryRoute } = await import('./LibraryRoute');

const renderRoute = (): void => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <TestSessionProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter
          initialEntries={['/library']}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Routes>
            <Route path="/library" element={<LibraryRoute />} />
            <Route
              path="/kid/sequence/:boardId"
              element={<div data-testid="kid-sequence-route" />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </TestSessionProvider>,
  );
};

beforeEach(() => {
  useBoardsMock.mockReset();
  useBoardsMock.mockReturnValue({ data: [], isPending: false });
});

describe('LibraryRoute', () => {
  it('renders the Library shell with pictograms from the cache', () => {
    renderRoute();
    expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument();
    expect(screen.getByText('Apple')).toBeInTheDocument();
  });

  it('clicking KID navigates into the first sequence board (regression: #71)', async () => {
    useBoardsMock.mockReturnValue({
      data: [
        {
          id: 'b-seq',
          ownerId: 'owner',
          kidId: 'k1',
          name: 'Morning',
          kind: 'sequence',
          labelsVisible: true,
          voiceMode: 'tts',
          stepIds: [],
          kidReorderable: false,
          accent: 'sage',
          updatedLabel: 'just now',
        },
      ],
      isPending: false,
    });
    renderRoute();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^kid$/i }));

    expect(screen.getByTestId('kid-sequence-route')).toBeInTheDocument();
  });
});
