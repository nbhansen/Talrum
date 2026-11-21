import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setPin } from '@/lib/pin';
import { makeBoard, TestProviders } from '@/lib/queries/queries.test-utils';
import type { Board, Kid, Pictogram } from '@/types/domain';

const KID: Kid = { id: 'k1', ownerId: 'owner', name: 'Liam' };

// One pictogram unhides the "From the library" strip, and with it "See all".
const RECENT_PICTO: Pictogram = {
  id: 'p-apple',
  slug: 'apple',
  label: 'Apple',
  style: 'illus',
  glyph: 'apple',
  tint: 'sunny',
};

const useKidsMock = vi.fn(() => ({ data: [KID] as Kid[], isPending: false }));
const useBoardsMock = vi.fn(() => ({ data: [] as Board[], isPending: false }));
const usePictogramsForSlugsMock = vi.fn((): Pictogram[] => [RECENT_PICTO]);
const createBoardMutateMock = vi.fn();
const useCreateBoardMock = vi.fn(() => ({
  mutate: createBoardMutateMock,
  isPending: false,
}));

vi.mock('@/lib/queries/kids', () => ({
  useKids: () => useKidsMock(),
  useCreateKid: () => ({ mutate: vi.fn(), isPending: false }),
  useActiveKid: () => useKidsMock().data?.[0] ?? null,
}));

vi.mock('@/lib/queries/boards', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useBoards: () => useBoardsMock(),
    useCreateBoard: () => useCreateBoardMock(),
  };
});

vi.mock('@/lib/queries/pictograms', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    usePictogramsForSlugs: () => usePictogramsForSlugsMock(),
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
      }),
    }),
  },
}));

const { ParentHomeRoute } = await import('./ParentHomeRoute');

const EXISTING_BOARD = makeBoard({ id: 'b1', kidId: 'k1', name: 'Existing' });

const renderHome = (): void => {
  render(
    <TestProviders>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<ParentHomeRoute />} />
          <Route path="/boards/:boardId/edit" element={<div data-testid="board-edit-route" />} />
          <Route path="/library" element={<div data-testid="library-route" />} />
          <Route path="/kid/:boardId" element={<div data-testid="kid-route" />} />
        </Routes>
      </MemoryRouter>
    </TestProviders>,
  );
};

beforeEach(() => {
  useKidsMock.mockReset();
  useKidsMock.mockReturnValue({ data: [KID], isPending: false });
  useBoardsMock.mockReset();
  useBoardsMock.mockReturnValue({ data: [], isPending: false });
  createBoardMutateMock.mockReset();
  useCreateBoardMock.mockReset();
  useCreateBoardMock.mockReturnValue({ mutate: createBoardMutateMock, isPending: false });
});

describe('ParentHomeRoute auto-launch', () => {
  it('renders ParentHome when no last board is recorded', () => {
    renderHome();
    expect(screen.queryByTestId('kid-route')).not.toBeInTheDocument();
    expect(screen.getByText(/Liam's boards/)).toBeInTheDocument();
  });

  it('redirects into the last board on first visit per session', async () => {
    await setPin('1234');
    localStorage.setItem('talrum:last-board', JSON.stringify({ id: 'b-seq' }));
    renderHome();
    expect(screen.getByTestId('kid-route')).toBeInTheDocument();
  });

  // Auto-launch is the one entry into kid mode with no user gesture, so it must
  // respect the PIN precondition too, or boot lands on a bounce to Settings
  // (#353).
  it('does not auto-launch into kid mode when no PIN is set (#353)', () => {
    localStorage.setItem('talrum:last-board', JSON.stringify({ id: 'b-seq' }));
    renderHome();
    expect(screen.queryByTestId('kid-route')).not.toBeInTheDocument();
    expect(screen.getByText(/Liam's boards/)).toBeInTheDocument();
  });

  it('does not redirect when the session has already auto-launched', () => {
    localStorage.setItem('talrum:last-board', JSON.stringify({ id: 'b-seq' }));
    sessionStorage.setItem('talrum:auto-launched', '1');
    renderHome();
    expect(screen.queryByTestId('kid-route')).not.toBeInTheDocument();
    expect(screen.getByText(/Liam's boards/)).toBeInTheDocument();
  });
});

describe('ParentHomeRoute header kidName', () => {
  it('reflects the real first kid name from the kids query (not a hardcoded placeholder)', () => {
    useKidsMock.mockReturnValue({
      data: [{ id: 'k-mira', ownerId: 'owner', name: 'Mira' }],
      isPending: false,
    });
    renderHome();
    expect(screen.getByText(/Mira's boards/)).toBeInTheDocument();
    expect(screen.queryByText(/Liam's boards/)).not.toBeInTheDocument();
  });

  it('falls back to a neutral "Boards" title when no kid is loaded yet', () => {
    useKidsMock.mockReturnValue({ data: [], isPending: false });
    renderHome();
    expect(screen.getByRole('heading', { level: 1, name: 'Boards' })).toBeInTheDocument();
    expect(screen.queryByText(/Liam's boards/)).not.toBeInTheDocument();
  });
});

describe('ParentHomeRoute create flows', () => {
  it('clicking New kid opens the kid modal', async () => {
    renderHome();
    expect(screen.queryByRole('heading', { name: /new kid/i })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /new kid/i }));

    expect(screen.getByRole('heading', { name: /new kid/i })).toBeInTheDocument();
  });

  it('shows the empty state when there are no boards', () => {
    renderHome();
    expect(screen.getByRole('heading', { name: /no boards yet/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create your first board/i })).toBeInTheDocument();
  });

  it('clicking the empty-state CTA opens the New board modal', async () => {
    renderHome();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /create your first board/i }));

    expect(screen.getByRole('heading', { name: /new board/i })).toBeInTheDocument();
  });

  it('clicking the header New board opens the modal even when boards exist', async () => {
    useBoardsMock.mockReturnValue({ data: [EXISTING_BOARD], isPending: false });
    renderHome();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^new board$/i }));

    expect(screen.getByRole('heading', { name: /^new board$/i })).toBeInTheDocument();
  });

  it('clicking New blank board fast-creates with the first kid and navigates to the board edit route', async () => {
    useBoardsMock.mockReturnValue({ data: [EXISTING_BOARD], isPending: false });
    createBoardMutateMock.mockImplementation(
      (_input: unknown, opts?: { onSuccess?: (b: Partial<Board>) => void }) => {
        opts?.onSuccess?.({ id: 'b-new' });
      },
    );

    renderHome();

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

  it('clicking See all navigates to /library', async () => {
    renderHome();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /see all/i }));

    expect(screen.getByTestId('library-route')).toBeInTheDocument();
  });

  it('hides the "From the library" section when no slugs resolve (#234)', () => {
    usePictogramsForSlugsMock.mockReturnValueOnce([]);
    renderHome();

    expect(screen.queryByRole('heading', { name: /from the library/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /see all/i })).toBeNull();
  });

  it('saving the New board modal navigates to the new board edit route', async () => {
    createBoardMutateMock.mockImplementation(
      (_input: unknown, opts?: { onSuccess?: (b: Partial<Board>) => void }) => {
        opts?.onSuccess?.({ id: 'b-new-from-modal' });
      },
    );

    renderHome();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /create your first board/i }));
    await user.type(screen.getByRole('textbox', { name: /name/i }), 'From modal');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(createBoardMutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'From modal',
        kind: 'sequence',
        kidId: 'k1',
      }),
      expect.any(Object),
    );
    expect(screen.getByTestId('board-edit-route')).toBeInTheDocument();
  });
});
