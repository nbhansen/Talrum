import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { JSX } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TestSessionProvider } from '@/lib/auth/session.test-utils';
import { boardsQueryKey } from '@/lib/queries/boards';
import type { BoardKind } from '@/types/domain';

const singleMock = vi.fn();
const eqMock = vi.fn(() => ({ single: singleMock }));
const selectMock = vi.fn(() => ({
  eq: eqMock,
  order: vi.fn(() => ({ limit: () => Promise.resolve({ data: [], error: null }) })),
}));
const fromMock = vi.fn(() => ({ select: selectMock }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => fromMock(),
    auth: {
      signOut: vi.fn(),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

vi.mock('@/features/kid-choice/KidChoice', () => ({
  KidChoice: (): JSX.Element => <div data-testid="choice-screen" />,
}));
vi.mock('@/features/kid-sequence/KidSequence', () => ({
  KidSequence: (): JSX.Element => <div data-testid="sequence-screen" />,
}));
vi.mock('@/widgets/KidModeGate/KidModeGate', () => ({
  KidModeGate: ({ children }: { children: (exit: () => void) => JSX.Element }): JSX.Element =>
    children(() => undefined),
}));

const { KidBoardRoute } = await import('./KidBoardRoute');

const BOARD_ID = '00000000-0000-0000-0000-000000000000';

const makeWrap = (qc: QueryClient): (() => JSX.Element) => {
  return (): JSX.Element => (
    <TestSessionProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[`/kid/${BOARD_ID}`]}>
          <Routes>
            <Route path="/kid/:boardId" element={<KidBoardRoute />} />
            <Route path="/" element={<div data-testid="parent-home" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </TestSessionProvider>
  );
};

describe('KidBoardRoute stale-board recovery', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it.each<BoardKind>(['choice', 'sequence'])(
    '%s: redirects to / and clears the last-board record when the board is gone (PGRST116)',
    async (kind) => {
      localStorage.setItem('talrum:last-board', JSON.stringify({ id: BOARD_ID, kind }));
      // Or the / route redirects back into the now-missing board on landing.
      sessionStorage.setItem('talrum:auto-launched', '1');

      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      qc.setQueryData(boardsQueryKey, []);
      singleMock.mockResolvedValueOnce({
        data: null,
        error: {
          message: 'JSON object requested, multiple (or no) rows returned',
          code: 'PGRST116',
        },
      });

      const Wrap = makeWrap(qc);
      render(<Wrap />);
      await waitFor(() => {
        expect(screen.getByTestId('parent-home')).toBeInTheDocument();
      });
      expect(localStorage.getItem('talrum:last-board')).toBeNull();
    },
  );
});

describe('KidBoardRoute screen', () => {
  it.each<BoardKind>(['choice', 'sequence'])(
    'renders the %s screen from the loaded board, not the URL',
    async (kind) => {
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      singleMock.mockResolvedValueOnce({
        data: {
          id: BOARD_ID,
          slug: null,
          owner_id: 'owner',
          kid_id: 'kid',
          name: 'Board',
          kind,
          labels_visible: true,
          voice_mode: 'tts',
          step_ids: [],
          kid_reorderable: false,
          accent: 'peach',
          updated_at: '2026-06-11T09:00:00.000001+00:00',
          created_at: '2026-06-11T09:00:00.000001+00:00',
        },
        error: null,
      });
      const Wrap = makeWrap(qc);
      render(<Wrap />);
      expect(await screen.findByTestId(`${kind}-screen`)).toBeInTheDocument();
      expect(localStorage.getItem('talrum:last-board')).toBe(JSON.stringify({ id: BOARD_ID }));
    },
  );
});
