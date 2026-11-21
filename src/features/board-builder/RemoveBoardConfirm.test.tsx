import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const deleteMock = vi.fn<(input: { boardId: string }) => Promise<void>>();
const leaveMock = vi.fn<(input: { boardId: string }) => Promise<void>>();

vi.mock('@/lib/queries/boards', () => ({
  useDeleteBoard: () => ({ mutateAsync: deleteMock, isPending: false }),
}));
vi.mock('@/lib/queries/board-members', () => ({
  useLeaveBoard: () => ({ mutateAsync: leaveMock, isPending: false }),
}));

const { RemoveBoardConfirm } = await import('./RemoveBoardConfirm');

afterEach(() => {
  vi.clearAllMocks();
});

const renderConfirm = (isOwner: boolean, onCancel = vi.fn(), onRemoved = vi.fn()) =>
  render(
    <RemoveBoardConfirm
      boardId="b-1"
      boardName="Morning routine"
      isOwner={isOwner}
      onCancel={onCancel}
      onRemoved={onRemoved}
    />,
  );

describe.each([
  { role: 'owner', isOwner: true, button: 'Delete forever', used: deleteMock, unused: leaveMock },
  { role: 'member', isOwner: false, button: 'Leave board', used: leaveMock, unused: deleteMock },
])('RemoveBoardConfirm for a board $role', ({ isOwner, button, used, unused }) => {
  it('confirming removes the board and calls onRemoved', async () => {
    used.mockResolvedValue(undefined);
    const onRemoved = vi.fn();
    renderConfirm(isOwner, vi.fn(), onRemoved);
    await userEvent.click(screen.getByRole('button', { name: button }));
    expect(used).toHaveBeenCalledWith({ boardId: 'b-1' });
    expect(unused).not.toHaveBeenCalled();
    expect(onRemoved).toHaveBeenCalledTimes(1);
  });

  it('shows fixed copy, not the raw error, and stays open on failure', async () => {
    used.mockRejectedValue(new Error('row-level-security'));
    const onRemoved = vi.fn();
    renderConfirm(isOwner, vi.fn(), onRemoved);
    await userEvent.click(screen.getByRole('button', { name: button }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/check your connection/i);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onRemoved).not.toHaveBeenCalled();
  });

  it('Cancel closes without a write', async () => {
    const onCancel = vi.fn();
    renderConfirm(isOwner, onCancel);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(used).not.toHaveBeenCalled();
  });
});
