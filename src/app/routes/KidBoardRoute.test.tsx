import type { QueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { boardsQueryKey } from '@/lib/queries/boards';
import { makeClient, TestProviders } from '@/lib/queries/queries.test-utils';
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

const renderRoute = (client: QueryClient): void => {
  render(
    <TestProviders client={client}>
      <MemoryRouter initialEntries={[`/kid/${BOARD_ID}`]}>
        <Routes>
          <Route path="/kid/:boardId" element={<KidBoardRoute />} />
          <Route path="/" element={<div data-testid="parent-home" />} />
        </Routes>
      </MemoryRouter>
    </TestProviders>,
  );
};

describe('KidBoardRoute stale-board recovery', () => {
  it('redirects to / and clears the last-board record when the board is gone (PGRST116)', async () => {
    localStorage.setItem('talrum:last-board', JSON.stringify({ id: BOARD_ID }));
    // Or the / route redirects back into the now-missing board on landing.
    sessionStorage.setItem('talrum:auto-launched', '1');

    const qc = makeClient();
    qc.setQueryData(boardsQueryKey, []);
    singleMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'JSON object requested, multiple (or no) rows returned',
        code: 'PGRST116',
      },
    });

    renderRoute(qc);
    expect(await screen.findByTestId('parent-home')).toBeInTheDocument();
    expect(localStorage.getItem('talrum:last-board')).toBeNull();
  });
});

describe('KidBoardRoute screen', () => {
  it.each<BoardKind>(['choice', 'sequence'])(
    'renders the %s screen from the loaded board, not the URL',
    async (kind) => {
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
      renderRoute(makeClient());
      expect(await screen.findByTestId(`${kind}-screen`)).toBeInTheDocument();
      expect(localStorage.getItem('talrum:last-board')).toBe(JSON.stringify({ id: BOARD_ID }));
    },
  );
});
