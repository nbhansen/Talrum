import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Board } from '@/types/domain';

const setBoardKindMock = vi.fn();
const renameBoardMock = vi.fn();
const deleteBoardMock = vi.fn();

vi.mock('@/lib/queries/boards', () => ({
  useRenameBoard: () => ({ mutate: renameBoardMock }),
  useSetBoardKind: () => ({ mutate: setBoardKindMock }),
  useSetKidReorderable: () => ({ mutate: vi.fn() }),
  useSetLabelsVisible: () => ({ mutate: vi.fn() }),
  useSetStepIds: () => ({
    mutate: vi.fn(),
    retry: vi.fn(),
    isError: false,
    error: null,
    isPending: false,
    reset: vi.fn(),
  }),
  useSetVoiceMode: () => ({ mutate: vi.fn() }),
  useDeleteBoard: () => ({ mutateAsync: deleteBoardMock, isPending: false }),
}));

vi.mock('@/lib/queries/pictograms', () => ({
  usePictograms: () => ({ data: [] }),
  usePictogramsById: () => new Map(),
}));

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
        onBack={noop}
        onOpenPicker={noop}
        onOpenShare={noop}
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

describe('BoardBuilder Quick add section (#234)', () => {
  it('hides the "Quick add from library" section when no slugs resolve', () => {
    render(
      <BoardBuilder
        board={baseBoard}
        isOwner
        onBack={noop}
        onOpenPicker={noop}
        onOpenShare={noop}
        onDeleted={noop}
        onKidMode={noop}
      />,
    );
    expect(screen.queryByRole('heading', { name: /quick add from library/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /browse all/i })).toBeNull();
  });
});
