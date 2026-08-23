import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mutateAsyncMock = vi.fn<(input: { boardId: string }) => Promise<void>>();

vi.mock('@/lib/queries/boards', () => ({
  useDeleteBoard: () => ({ mutateAsync: mutateAsyncMock, isPending: false }),
}));

const { DeleteBoardConfirm } = await import('./DeleteBoardConfirm');

afterEach(() => {
  vi.clearAllMocks();
});

describe('DeleteBoardConfirm', () => {
  it('confirming deletes the board and calls onDeleted', async () => {
    mutateAsyncMock.mockResolvedValue(undefined);
    const onDeleted = vi.fn();
    render(
      <DeleteBoardConfirm
        boardId="b-1"
        boardName="Morning routine"
        onCancel={vi.fn()}
        onDeleted={onDeleted}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete forever' }));
    expect(mutateAsyncMock).toHaveBeenCalledWith({ boardId: 'b-1' });
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it('shows an error and stays open when the delete fails', async () => {
    mutateAsyncMock.mockRejectedValue(new Error('row-level-security'));
    const onDeleted = vi.fn();
    render(
      <DeleteBoardConfirm
        boardId="b-1"
        boardName="Morning routine"
        onCancel={vi.fn()}
        onDeleted={onDeleted}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete forever' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('Cancel closes without deleting', async () => {
    const onCancel = vi.fn();
    render(
      <DeleteBoardConfirm
        boardId="b-1"
        boardName="Morning routine"
        onCancel={onCancel}
        onDeleted={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });
});
