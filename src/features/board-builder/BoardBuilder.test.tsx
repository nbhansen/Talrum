import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Board, Pictogram } from '@/types/domain';

const setBoardKindMock = vi.fn();
const renameBoardMock = vi.fn();
const deleteBoardMock = vi.fn();
const setStepIdsMock = vi.fn();
const stepIdsResult = {
  mutate: setStepIdsMock,
  retry: vi.fn(),
  isError: false,
  error: null,
  isPending: false,
  reset: vi.fn(),
};
let pictogramsById = new Map<string, Pictogram>();

vi.mock('@/lib/queries/boards', () => ({
  useRenameBoard: () => ({ mutate: renameBoardMock }),
  useSetBoardKind: () => ({ mutate: setBoardKindMock }),
  useSetKidReorderable: () => ({ mutate: vi.fn() }),
  useSetLabelsVisible: () => ({ mutate: vi.fn() }),
  useSetVoiceMode: () => ({ mutate: vi.fn() }),
  useDeleteBoard: () => ({ mutateAsync: deleteBoardMock, isPending: false }),
}));

vi.mock('@/lib/queries/pictograms', () => ({
  usePictograms: () => ({ data: [] }),
  usePictogramsById: () => pictogramsById,
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
  updatedLabel: 'Edited just now',
};

const noop = (): void => undefined;

afterEach(() => {
  vi.clearAllMocks();
});

describe('BoardBuilder title', () => {
  // The rename is debounced, and the unmount cleanup cleared the timer, so a
  // back tap inside the debounce window dropped the last edit (#444).
  it('flushes a pending rename when it unmounts', () => {
    vi.useFakeTimers();
    try {
      const { unmount } = render(
        <BoardBuilder
          board={baseBoard}
          isOwner
          setStepIds={stepIdsResult}
          onBack={noop}
          onOpenPicker={noop}
          onOpenShare={noop}
          onDeleted={noop}
          onKidMode={noop}
        />,
      );
      fireEvent.change(screen.getByDisplayValue('Morning routine'), {
        target: { value: 'Evening routine' },
      });
      expect(renameBoardMock).not.toHaveBeenCalled();

      unmount();

      expect(renameBoardMock).toHaveBeenCalledWith({ boardId: 'board-1', name: 'Evening routine' });
      vi.runAllTimers();
      expect(renameBoardMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('BoardBuilder blank title', () => {
  const renderBuilder = (): ReturnType<typeof render> =>
    render(
      <BoardBuilder
        board={baseBoard}
        isOwner
        setStepIds={stepIdsResult}
        onBack={noop}
        onOpenPicker={noop}
        onOpenShare={noop}
        onDeleted={noop}
        onKidMode={noop}
      />,
    );

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

      expect(renameBoardMock).not.toHaveBeenCalled();
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

      expect(renameBoardMock).toHaveBeenCalledWith({ boardId: 'board-1', name: 'Evening routine' });
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
    render(
      <BoardBuilder
        board={baseBoard}
        isOwner
        setStepIds={stepIdsResult}
        onBack={noop}
        onOpenPicker={noop}
        onOpenShare={noop}
        onDeleted={noop}
        onKidMode={noop}
      />,
    );
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
  });

  it('hides the Share button when isOwner=false', () => {
    render(
      <BoardBuilder
        board={baseBoard}
        isOwner={false}
        setStepIds={stepIdsResult}
        onBack={noop}
        onOpenPicker={noop}
        onOpenShare={noop}
        onDeleted={noop}
        onKidMode={noop}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
  });

  it('invokes onOpenShare when the button is clicked', () => {
    const onOpenShare = vi.fn();
    render(
      <BoardBuilder
        board={baseBoard}
        isOwner
        setStepIds={stepIdsResult}
        onBack={noop}
        onOpenPicker={noop}
        onOpenShare={onOpenShare}
        onDeleted={noop}
        onKidMode={noop}
      />,
    );
    screen.getByRole('button', { name: 'Share' }).click();
    expect(onOpenShare).toHaveBeenCalledTimes(1);
  });
});

describe('BoardBuilder Delete board (#520)', () => {
  const renderOwner = (isOwner: boolean): void => {
    render(
      <BoardBuilder
        board={baseBoard}
        isOwner={isOwner}
        setStepIds={stepIdsResult}
        onBack={noop}
        onOpenPicker={noop}
        onOpenShare={noop}
        onDeleted={noop}
        onKidMode={noop}
      />,
    );
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

describe('BoardBuilder kind switch confirm (#233)', () => {
  it('clicking the other kind tab opens a confirm modal without mutating', async () => {
    render(
      <BoardBuilder
        board={baseBoard}
        isOwner
        setStepIds={stepIdsResult}
        onBack={noop}
        onOpenPicker={noop}
        onOpenShare={noop}
        onDeleted={noop}
        onKidMode={noop}
      />,
    );
    await userEvent.click(screen.getByRole('tab', { name: /Choice/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Switch to Choice/i })).toBeInTheDocument();
    expect(setBoardKindMock).not.toHaveBeenCalled();
  });

  it('confirming the modal mutates the kind once', async () => {
    render(
      <BoardBuilder
        board={baseBoard}
        isOwner
        setStepIds={stepIdsResult}
        onBack={noop}
        onOpenPicker={noop}
        onOpenShare={noop}
        onDeleted={noop}
        onKidMode={noop}
      />,
    );
    await userEvent.click(screen.getByRole('tab', { name: /Choice/i }));
    await userEvent.click(screen.getByRole('button', { name: /Switch to Choice/i }));
    expect(setBoardKindMock).toHaveBeenCalledTimes(1);
    expect(setBoardKindMock).toHaveBeenCalledWith({ boardId: baseBoard.id, kind: 'choice' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cancelling the modal leaves kind unchanged', async () => {
    render(
      <BoardBuilder
        board={baseBoard}
        isOwner
        setStepIds={stepIdsResult}
        onBack={noop}
        onOpenPicker={noop}
        onOpenShare={noop}
        onDeleted={noop}
        onKidMode={noop}
      />,
    );
    await userEvent.click(screen.getByRole('tab', { name: /Choice/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(setBoardKindMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('clicking the already-active tab does not open the modal', async () => {
    render(
      <BoardBuilder
        board={baseBoard}
        isOwner
        setStepIds={stepIdsResult}
        onBack={noop}
        onOpenPicker={noop}
        onOpenShare={noop}
        onDeleted={noop}
        onKidMode={noop}
      />,
    );
    await userEvent.click(screen.getByRole('tab', { name: /Sequence/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(setBoardKindMock).not.toHaveBeenCalled();
  });
});

describe('BoardBuilder track (#522)', () => {
  const renderKind = (kind: Board['kind'], stepIds: string[]): void => {
    render(
      <BoardBuilder
        board={{ ...baseBoard, kind, stepIds }}
        isOwner
        setStepIds={stepIdsResult}
        onBack={noop}
        onOpenPicker={noop}
        onOpenShare={noop}
        onDeleted={noop}
        onKidMode={noop}
      />,
    );
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
    render(
      <BoardBuilder
        board={{ ...baseBoard, stepIds }}
        isOwner
        setStepIds={stepIdsResult}
        onBack={noop}
        onOpenPicker={noop}
        onOpenShare={noop}
        onDeleted={noop}
        onKidMode={noop}
      />,
    );
  };

  afterEach(() => {
    pictogramsById = new Map();
  });

  const capturedUpdate = (): ((prev: string[]) => string[]) => {
    expect(setStepIdsMock).toHaveBeenCalledTimes(1);
    const arg = setStepIdsMock.mock.calls[0]?.[0] as {
      boardId: string;
      update: (prev: string[]) => string[];
    };
    expect(arg.boardId).toBe(baseBoard.id);
    return arg.update;
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
    render(
      <BoardBuilder
        board={baseBoard}
        isOwner
        setStepIds={stepIdsResult}
        onBack={noop}
        onOpenPicker={noop}
        onOpenShare={noop}
        onDeleted={noop}
        onKidMode={noop}
      />,
    );
    expect(screen.queryByRole('heading', { name: /add from the library/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /browse all/i })).toBeNull();
  });
});
