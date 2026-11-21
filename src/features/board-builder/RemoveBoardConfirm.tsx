import { type JSX, useState } from 'react';

import { useLeaveBoard } from '@/lib/queries/board-members';
import { useDeleteBoard } from '@/lib/queries/boards';
import { Button } from '@/ui/Button/Button';
import { DialogActions } from '@/ui/DialogActions/DialogActions';
import { DialogHeader } from '@/ui/DialogHeader/DialogHeader';
import { FormError } from '@/ui/FormError/FormError';
import { Modal } from '@/ui/Modal/Modal';

const COPY = {
  delete: {
    title: 'Delete',
    subtitle: 'It disappears for everyone it is shared with. Pictograms stay in your library.',
    confirm: 'Delete forever',
    pending: 'Deleting…',
    error: 'Could not delete the board. Check your connection and try again.',
  },
  leave: {
    title: 'Leave',
    subtitle: 'The board leaves your list. Only its owner can share it with you again.',
    confirm: 'Leave board',
    pending: 'Leaving…',
    error: 'Could not leave the board. Check your connection and try again.',
  },
} as const;

interface RemoveBoardConfirmProps {
  boardId: string;
  boardName: string;
  /** The owner deletes the board; a member leaves it. */
  isOwner: boolean;
  onCancel: () => void;
  onRemoved: () => void;
}

export const RemoveBoardConfirm = ({
  boardId,
  boardName,
  isOwner,
  onCancel,
  onRemoved,
}: RemoveBoardConfirmProps): JSX.Element => {
  const deleteBoard = useDeleteBoard();
  const leaveBoard = useLeaveBoard();
  const mutation = isOwner ? deleteBoard : leaveBoard;
  const copy = COPY[isOwner ? 'delete' : 'leave'];
  const [failed, setFailed] = useState(false);

  const confirm = (): void => {
    setFailed(false);
    mutation.mutateAsync({ boardId }).then(onRemoved, () => setFailed(true));
  };

  return (
    <Modal onClose={onCancel} size="sm" padded>
      <DialogHeader title={`${copy.title} "${boardName}"?`} subtitle={copy.subtitle} />
      {failed && <FormError spaced>{copy.error}</FormError>}
      <DialogActions>
        <Button variant="ghost" onClick={onCancel} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button variant="danger" onClick={confirm} disabled={mutation.isPending}>
          {mutation.isPending ? copy.pending : copy.confirm}
        </Button>
      </DialogActions>
    </Modal>
  );
};
