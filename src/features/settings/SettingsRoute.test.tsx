import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TestSessionProvider } from '@/lib/auth/session.test-utils';
import type { Board } from '@/types/domain';

const useBoardsMock = vi.fn(() => ({ data: [] as Board[], isPending: false }));

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

const { SettingsRoute } = await import('./SettingsRoute');

const renderRoute = (): void => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <TestSessionProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter
          initialEntries={['/settings']}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Routes>
            <Route path="/settings" element={<SettingsRoute />} />
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

describe('SettingsRoute', () => {
  it('renders the Settings header and a coming-soon body', () => {
    renderRoute();
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText(/coming in a future release/i)).toBeInTheDocument();
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
          accentInk: 'sage-ink',
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
