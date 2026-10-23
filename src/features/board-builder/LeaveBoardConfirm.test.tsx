import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mutateAsyncMock = vi.fn<(input: { boardId: string }) => Promise<void>>();

vi.mock('@/lib/queries/board-members', () => ({
  useLeaveBoard: () => ({ mutateAsync: mutateAsyncMock, isPending: false }),
}));

const { LeaveBoardConfirm } = await import('./LeaveBoardConfirm');

afterEach(() => {
  vi.clearAllMocks();
});

const renderConfirm = (onCancel = vi.fn(), onLeft = vi.fn()) =>
  render(
    <LeaveBoardConfirm
      boardId="b-1"
      boardName="Morning routine"
      onCancel={onCancel}
      onLeft={onLeft}
    />,
  );

describe('LeaveBoardConfirm', () => {
  it('confirming leaves the board and calls onLeft', async () => {
    mutateAsyncMock.mockResolvedValue(undefined);
    const onLeft = vi.fn();
    renderConfirm(vi.fn(), onLeft);
    await userEvent.click(screen.getByRole('button', { name: 'Leave board' }));
    expect(mutateAsyncMock).toHaveBeenCalledWith({ boardId: 'b-1' });
    expect(onLeft).toHaveBeenCalledTimes(1);
  });

  it('shows an error and stays open when leaving fails', async () => {
    mutateAsyncMock.mockRejectedValue(new Error('Failed to fetch'));
    const onLeft = vi.fn();
    renderConfirm(vi.fn(), onLeft);
    await userEvent.click(screen.getByRole('button', { name: 'Leave board' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onLeft).not.toHaveBeenCalled();
  });

  it('Cancel closes without leaving', async () => {
    const onCancel = vi.fn();
    renderConfirm(onCancel);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });
});
