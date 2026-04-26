import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TestSessionProvider } from '@/lib/auth/session.test-utils';
import type { Board, Kid } from '@/types/domain';

const KID: Kid = { id: 'k1', ownerId: 'owner', name: 'Liam' };

const useKidsMock = vi.fn(() => ({ data: [KID] as Kid[], isPending: false }));
const useBoardsMock = vi.fn(() => ({ data: [] as Board[], isPending: false }));
const createBoardMutateMock = vi.fn();
const useCreateBoardMock = vi.fn(() => ({
  mutate: createBoardMutateMock,
  isPending: false,
}));

vi.mock('@/lib/queries/kids', () => ({
  useKids: () => useKidsMock(),
  useCreateKid: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/lib/queries/boards', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useBoards: () => useBoardsMock(),
    useCreateBoard: () => useCreateBoardMock(),
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
    }),
    auth: {
      signOut: vi.fn(),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

const { ParentHomeRoute } = await import('./ParentHomeRoute');

const makeWrap = (initialPath: string): (() => JSX.Element) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (): JSX.Element => (
    <TestSessionProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter
          initialEntries={[initialPath]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Routes>
            <Route path="/" element={<ParentHomeRoute />} />
            <Route path="/boards/:boardId/edit" element={<div data-testid="board-edit-route" />} />
            <Route
              path="/kid/sequence/:boardId"
              element={<div data-testid="kid-sequence-route" />}
            />
            <Route path="/kid/choice/:boardId" element={<div data-testid="kid-choice-route" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </TestSessionProvider>
  );
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  useKidsMock.mockReset();
  useKidsMock.mockReturnValue({ data: [KID], isPending: false });
  useBoardsMock.mockReset();
  useBoardsMock.mockReturnValue({ data: [], isPending: false });
  createBoardMutateMock.mockReset();
  useCreateBoardMock.mockReset();
  useCreateBoardMock.mockReturnValue({ mutate: createBoardMutateMock, isPending: false });
});
afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('ParentHomeRoute auto-launch', () => {
  it('renders ParentHome when no last board is recorded', () => {
    const Wrap = makeWrap('/');
    render(<Wrap />);
    expect(screen.queryByTestId('kid-sequence-route')).not.toBeInTheDocument();
    expect(screen.queryByTestId('kid-choice-route')).not.toBeInTheDocument();
    expect(screen.getByText(/Liam's boards/)).toBeInTheDocument();
  });

  it('redirects into the last sequence board on first visit per session', () => {
    localStorage.setItem('talrum:last-board', JSON.stringify({ id: 'b-seq', kind: 'sequence' }));
    const Wrap = makeWrap('/');
    render(<Wrap />);
    expect(screen.getByTestId('kid-sequence-route')).toBeInTheDocument();
  });

  it('redirects into the last choice board on first visit per session', () => {
    localStorage.setItem('talrum:last-board', JSON.stringify({ id: 'b-cho', kind: 'choice' }));
    const Wrap = makeWrap('/');
    render(<Wrap />);
    expect(screen.getByTestId('kid-choice-route')).toBeInTheDocument();
  });

  it('does not redirect when the session has already auto-launched', () => {
    localStorage.setItem('talrum:last-board', JSON.stringify({ id: 'b-seq', kind: 'sequence' }));
    sessionStorage.setItem('talrum:auto-launched', '1');
    const Wrap = makeWrap('/');
    render(<Wrap />);
    expect(screen.queryByTestId('kid-sequence-route')).not.toBeInTheDocument();
    expect(screen.getByText(/Liam's boards/)).toBeInTheDocument();
  });
});

describe('ParentHomeRoute create flows', () => {
  it('clicking New kid opens the kid modal', async () => {
    const Wrap = makeWrap('/');
    render(<Wrap />);
    expect(screen.queryByRole('heading', { name: /add a kid/i })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /new kid/i }));

    expect(screen.getByRole('heading', { name: /add a kid/i })).toBeInTheDocument();
  });

  it('shows the empty state when there are no boards', () => {
    const Wrap = makeWrap('/');
    render(<Wrap />);
    expect(screen.getByRole('heading', { name: /no boards yet/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create your first board/i })).toBeInTheDocument();
  });

  it('clicking the empty-state CTA opens the New board modal', async () => {
    const Wrap = makeWrap('/');
    render(<Wrap />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /create your first board/i }));

    expect(screen.getByRole('heading', { name: /new board/i })).toBeInTheDocument();
  });

  it('clicking the header New board opens the modal even when boards exist', async () => {
    useBoardsMock.mockReturnValue({
      data: [
        {
          id: 'b1',
          ownerId: 'owner',
          kidId: 'k1',
          name: 'Existing',
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
    const Wrap = makeWrap('/');
    render(<Wrap />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^new board$/i }));

    expect(screen.getByRole('heading', { name: /^new board$/i })).toBeInTheDocument();
  });

  it('clicking New blank board fast-creates with the first kid and navigates to the board edit route', async () => {
    useBoardsMock.mockReturnValue({
      data: [
        {
          id: 'b1',
          ownerId: 'owner',
          kidId: 'k1',
          name: 'Existing',
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
    createBoardMutateMock.mockImplementation(
      (_input: unknown, opts?: { onSuccess?: (b: Partial<Board>) => void }) => {
        opts?.onSuccess?.({ id: 'b-new' });
      },
    );

    const Wrap = makeWrap('/');
    render(<Wrap />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /new blank board/i }));

    expect(createBoardMutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Untitled board',
        kind: 'sequence',
        kidId: 'k1',
      }),
      expect.any(Object),
    );
    expect(screen.getByTestId('board-edit-route')).toBeInTheDocument();
  });
});
