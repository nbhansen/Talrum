import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Board } from '@/types/domain';

const setBoardKindMock = vi.fn();
const renameBoardMock = vi.fn();

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

describe('BoardBuilder Share button', () => {
  it('renders the Share button when isOwner=true', () => {
    render(
      <BoardBuilder
        board={baseBoard}
        isOwner
        onBack={noop}
        onOpenPicker={noop}
        onOpenShare={noop}
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
        onKidMode={noop}
      />,
    );
    screen.getByRole('button', { name: 'Share' }).click();
    expect(onOpenShare).toHaveBeenCalledTimes(1);
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
        onKidMode={noop}
      />,
    );
    await userEvent.click(screen.getByRole('tab', { name: /Sequence/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(setBoardKindMock).not.toHaveBeenCalled();
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
        onKidMode={noop}
      />,
    );
    expect(screen.queryByRole('heading', { name: /quick add from library/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /browse all/i })).toBeNull();
  });
});
