import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, JSX, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Board, Pictogram } from '@/types/domain';

interface BoardUpdate {
  boardId: string;
  update: (b: Board) => Partial<Board>;
}
const deleteBoardMock = vi.fn();
const updateBoardMock = vi.fn<(input: BoardUpdate) => void>();
const updateBoardResult: {
  mutate: typeof updateBoardMock;
  isError: boolean;
  variables: BoardUpdate | undefined;
  reset: () => void;
} = { mutate: updateBoardMock, isError: false, variables: undefined, reset: vi.fn() };
let pictogramsById = new Map<string, Pictogram>();

vi.mock('@/lib/queries/boards', () => ({
  useUpdateBoard: () => updateBoardResult,
  useDeleteBoard: () => ({ mutateAsync: deleteBoardMock, isPending: false }),
}));

/** The fields the last write derives from `board`. */
const writtenFields = (board: Board = baseBoard): Partial<Board> => {
  const input = updateBoardMock.mock.calls.at(-1)?.[0];
  expect(input?.boardId).toBe(board.id);
  return input?.update(board) ?? {};
};

const leaveBoardMock = vi.fn();
vi.mock('@/lib/queries/board-members', () => ({
  useLeaveBoard: () => ({ mutateAsync: leaveBoardMock, isPending: false }),
}));

vi.mock('@/lib/queries/pictograms', () => ({
  usePictogramsById: () => pictogramsById,
  usePictogramsBySlug: () => new Map(),
}));

vi.mock('./pictogram-picker/PictoPicker', () => ({
  PictoPicker: (props: { onConfirm: (ids: readonly string[]) => void }): JSX.Element => (
    <button type="button" onClick={() => props.onConfirm(['picked-1', 'picked-2'])}>
      confirm picker
    </button>
  ),
}));

vi.mock('./ShareModal', () => ({
  ShareModal: (): JSX.Element => <div role="dialog" aria-label="Share board" />,
}));

// Stub: a real drag needs pointer geometry jsdom does not have. The "reverse
// order" button hands BoardBuilder the same nextKeys a completed drag would.
vi.mock('@/ui/Reorderable/Reorderable', () => {
  const drag = {
    setNodeRef: (): void => undefined,
    style: {},
    attributes: {},
    listeners: {},
    isDragging: false,
  };
  return {
    Reorderable: <T extends { id: string }>(props: {
      items: readonly T[];
      onReorder: (nextIds: string[]) => void;
      renderItem: (item: T, index: number, bindings: typeof drag) => ReactNode;
    }): JSX.Element => (
      <>
        {props.items.map((item, i) => props.renderItem(item, i, drag))}
        <button
          type="button"
          onClick={() => props.onReorder(props.items.map((it) => it.id).reverse())}
        >
          reverse order
        </button>
      </>
    ),
  };
});

vi.mock('@/layouts/ParentShell', () => ({
  ParentShell: ({ children }: { children: JSX.Element }): JSX.Element => <div>{children}</div>,
}));

const { BoardBuilder } = await import('./BoardBuilder');

const baseBoard: Board = {
  id: 'board-1',
  ownerId: 'owner-1',
  kidId: 'kid-1',
  name: 'Morning routine',
  kind: 'sequence',
  labelsVisible: true,
  voiceMode: 'tts',
  stepIds: [],
  kidReorderable: false,
  accent: 'peach',
};

const noop = (): void => undefined;

const BoardBuilderAt = ({
  url = '/',
  ...props
}: Partial<ComponentProps<typeof BoardBuilder>> & { url?: string }): JSX.Element => (
  <MemoryRouter initialEntries={[url]}>
    <BoardBuilder
      board={baseBoard}
      isOwner
      onBack={noop}
      onRemoved={noop}
      onKidMode={noop}
      {...props}
    />
  </MemoryRouter>
);

afterEach(() => {
  vi.clearAllMocks();
  updateBoardResult.isError = false;
  updateBoardResult.variables = undefined;
});

describe('BoardBuilder title', () => {
  // The rename is debounced, and the unmount cleanup cleared the timer, so a
  // back tap inside the debounce window dropped the last edit (#444).
  it('flushes a pending rename when it unmounts', () => {
    vi.useFakeTimers();
    try {
      const { unmount } = render(<BoardBuilderAt board={baseBoard} isOwner />);
      fireEvent.change(screen.getByDisplayValue('Morning routine'), {
        target: { value: 'Evening routine' },
      });
      expect(updateBoardMock).not.toHaveBeenCalled();

      unmount();

      expect(writtenFields()).toEqual({ name: 'Evening routine' });
      vi.runAllTimers();
      expect(updateBoardMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('BoardBuilder title after a refetch (#766)', () => {
  it('shows the refetched name when no rename is waiting', () => {
    const { rerender } = render(<BoardBuilderAt board={baseBoard} isOwner />);

    rerender(<BoardBuilderAt board={{ ...baseBoard, name: 'Server name' }} isOwner />);

    expect(screen.getByDisplayValue('Server name')).toBeInTheDocument();
  });

  it('keeps what the user types while their rename waits', () => {
    vi.useFakeTimers();
    try {
      const { rerender, unmount } = render(<BoardBuilderAt board={baseBoard} isOwner />);
      fireEvent.change(screen.getByDisplayValue('Morning routine'), {
        target: { value: 'Evening routine' },
      });

      rerender(<BoardBuilderAt board={{ ...baseBoard, name: 'Server name' }} isOwner />);

      expect(screen.getByDisplayValue('Evening routine')).toBeInTheDocument();
      unmount();
      expect(writtenFields()).toEqual({ name: 'Evening routine' });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('BoardBuilder blank title', () => {
  const renderBuilder = (): ReturnType<typeof render> =>
    render(<BoardBuilderAt board={baseBoard} isOwner />);

  // A blank name reached the row on a 300 ms pause or a back tap, and the
  // create path refuses one (#480).
  it('never writes a blank name, and cancels the write it replaces', () => {
    vi.useFakeTimers();
    try {
      const { unmount } = renderBuilder();
      const input = screen.getByDisplayValue('Morning routine');
      fireEvent.change(input, { target: { value: 'Evening routine' } });
      fireEvent.change(input, { target: { value: '   ' } });

      vi.runAllTimers();
      unmount();

      expect(updateBoardMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('trims the name it writes, like the create path', () => {
    vi.useFakeTimers();
    try {
      renderBuilder();
      fireEvent.change(screen.getByDisplayValue('Morning routine'), {
        target: { value: '  Evening routine  ' },
      });

      vi.runAllTimers();

      expect(writtenFields()).toEqual({ name: 'Evening routine' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('puts the saved name back when a blank field loses focus', () => {
    renderBuilder();
    const input = screen.getByDisplayValue('Morning routine');
    fireEvent.change(input, { target: { value: '' } });
    expect(input).toHaveValue('');

    fireEvent.blur(input);

    expect(input).toHaveValue('Morning routine');
  });
});

describe('BoardBuilder Share button', () => {
  it('renders the Share button when isOwner=true', () => {
    render(<BoardBuilderAt board={baseBoard} isOwner />);
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
  });

  it('hides the Share button when isOwner=false', () => {
    render(<BoardBuilderAt board={baseBoard} isOwner={false} />);
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
  });

  it('opens the share dialog when the button is clicked', async () => {
    render(<BoardBuilderAt />);
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(screen.getByRole('dialog', { name: 'Share board' })).toBeInTheDocument();
  });

  it('opens the share dialog from a ?share=1 link', () => {
    render(<BoardBuilderAt url="/?share=1" />);
    expect(screen.getByRole('dialog', { name: 'Share board' })).toBeInTheDocument();
  });
});

describe('BoardBuilder Delete board (#520)', () => {
  const renderOwner = (isOwner: boolean): void => {
    render(<BoardBuilderAt board={baseBoard} isOwner={isOwner} />);
  };

  it('renders the Delete board button when isOwner=true', () => {
    renderOwner(true);
    expect(screen.getByRole('button', { name: 'Delete board' })).toBeInTheDocument();
  });

  it('hides the Delete board button when isOwner=false', () => {
    renderOwner(false);
    expect(screen.queryByRole('button', { name: 'Delete board' })).not.toBeInTheDocument();
  });

  it('opens the confirm dialog without deleting', async () => {
    renderOwner(true);
    await userEvent.click(screen.getByRole('button', { name: 'Delete board' }));
    expect(screen.getByRole('dialog', { name: /delete "morning routine"/i })).toBeInTheDocument();
    expect(deleteBoardMock).not.toHaveBeenCalled();
  });
});

describe('BoardBuilder Leave board (#666)', () => {
  const renderOwner = (isOwner: boolean): void => {
    render(<BoardBuilderAt board={baseBoard} isOwner={isOwner} />);
  };

  it('hides the Leave board button on an own board', () => {
    renderOwner(true);
    expect(screen.queryByRole('button', { name: 'Leave board' })).not.toBeInTheDocument();
  });

  it('opens the confirm dialog on a shared board without leaving', async () => {
    renderOwner(false);
    await userEvent.click(screen.getByRole('button', { name: 'Leave board' }));
    expect(screen.getByRole('dialog', { name: /leave "morning routine"/i })).toBeInTheDocument();
    expect(leaveBoardMock).not.toHaveBeenCalled();
  });
});

describe('BoardBuilder kind switch confirm (#233)', () => {
  it('clicking the other kind tab opens a confirm modal without mutating', async () => {
    render(<BoardBuilderAt board={baseBoard} isOwner />);
    await userEvent.click(screen.getByRole('radio', { name: /Choice/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Switch to Choice/i })).toBeInTheDocument();
    expect(updateBoardMock).not.toHaveBeenCalled();
  });

  it('confirming the modal mutates the kind once', async () => {
    render(<BoardBuilderAt board={baseBoard} isOwner />);
    await userEvent.click(screen.getByRole('radio', { name: /Choice/i }));
    await userEvent.click(screen.getByRole('button', { name: /Switch to Choice/i }));
    expect(updateBoardMock).toHaveBeenCalledTimes(1);
    expect(writtenFields()).toEqual({ kind: 'choice' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cancelling the modal leaves kind unchanged', async () => {
    render(<BoardBuilderAt board={baseBoard} isOwner />);
    await userEvent.click(screen.getByRole('radio', { name: /Choice/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(updateBoardMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('clicking the already-active tab does not open the modal', async () => {
    render(<BoardBuilderAt board={baseBoard} isOwner />);
    await userEvent.click(screen.getByRole('radio', { name: /Sequence/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(updateBoardMock).not.toHaveBeenCalled();
  });
});

describe('BoardBuilder track (#522)', () => {
  const renderKind = (kind: Board['kind'], stepIds: string[]): void => {
    render(<BoardBuilderAt board={{ ...baseBoard, kind, stepIds }} isOwner />);
  };

  it('shows the step count hint for sequence boards', () => {
    renderKind('sequence', ['a', 'b', 'c']);
    expect(screen.getByText(/3 steps · drag to reorder/)).toBeInTheDocument();
  });

  it('shows the option count hint for choice boards', () => {
    renderKind('choice', ['a']);
    expect(screen.getByText(/1 option · drag to reorder/)).toBeInTheDocument();
  });

  it('keeps the Add picto tile outside the scrolling rail', () => {
    renderKind('sequence', ['a', 'b']);
    const rail = document.querySelector('.tal-scroll');
    expect(rail).not.toBeNull();
    const addTile = screen.getByRole('button', { name: /add picto/i });
    expect(rail?.contains(addTile)).toBe(false);
  });
});

describe('BoardBuilder steps with a missing pictogram', () => {
  // A stepId can be unresolvable on a shared board (owner-scoped pictogram),
  // or transiently while the pictogram query loads. Remove and reorder must
  // act on the full stepIds array, never on rendered positions.
  const apple: Pictogram = {
    id: 'apple-uuid',
    label: 'Apple',
    style: 'illus',
    glyph: 'apple',
    tint: 'oklch(88% 0.05 20)',
  };
  const cup: Pictogram = {
    id: 'cup-uuid',
    label: 'Drink',
    style: 'illus',
    glyph: 'cup',
    tint: 'oklch(88% 0.05 240)',
  };
  const stepIds = [apple.id, 'ghost-uuid', cup.id];

  const renderBoard = (): void => {
    pictogramsById = new Map([
      [apple.id, apple],
      [cup.id, cup],
    ]);
    render(<BoardBuilderAt board={{ ...baseBoard, stepIds }} isOwner />);
  };

  afterEach(() => {
    pictogramsById = new Map();
  });

  const capturedUpdate = (): ((prev: string[]) => string[] | undefined) => (prev) => {
    expect(updateBoardMock).toHaveBeenCalledTimes(1);
    return writtenFields({ ...baseBoard, stepIds: prev }).stepIds;
  };

  it('removes the tapped step, not the step at its rendered position', async () => {
    renderBoard();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Drink' }));
    expect(capturedUpdate()(stepIds)).toEqual([apple.id, 'ghost-uuid']);
  });

  it('keeps unresolvable steps in place when the rendered steps reorder', async () => {
    renderBoard();
    await userEvent.click(screen.getByRole('button', { name: 'reverse order' }));
    expect(capturedUpdate()(stepIds)).toEqual([cup.id, 'ghost-uuid', apple.id]);
  });
});

describe('BoardBuilder Quick add section (#234)', () => {
  it('hides the "Add from the library" section when no slugs resolve', () => {
    render(<BoardBuilderAt board={baseBoard} isOwner />);
    expect(screen.queryByRole('heading', { name: /add from the library/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /browse all/i })).toBeNull();
  });
});

describe('BoardBuilder picker', () => {
  it('opens from a ?picker=1 link and appends the confirmed pictograms', async () => {
    render(<BoardBuilderAt url="/?picker=1" board={{ ...baseBoard, stepIds: ['a'] }} />);
    await userEvent.click(screen.getByRole('button', { name: 'confirm picker' }));
    expect(writtenFields({ ...baseBoard, stepIds: ['a'] })).toEqual({
      stepIds: ['a', 'picked-1', 'picked-2'],
    });
  });
});

describe('BoardBuilder write error', () => {
  it('shows no banner while the writes succeed', () => {
    render(<BoardBuilderAt />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('retries the failed write with the same input, so it re-derives from fresh cache', async () => {
    const failed: BoardUpdate = { boardId: baseBoard.id, update: () => ({ labelsVisible: false }) };
    updateBoardResult.isError = true;
    updateBoardResult.variables = failed;
    render(<BoardBuilderAt />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save change");
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(updateBoardMock).toHaveBeenCalledWith(failed);
  });

  it('dismisses the banner', async () => {
    updateBoardResult.isError = true;
    render(<BoardBuilderAt />);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(updateBoardResult.reset).toHaveBeenCalledTimes(1);
  });
});
