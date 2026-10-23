import { type JSX, useState } from 'react';

import { useLeaveBoard } from '@/lib/queries/board-members';
import { Button } from '@/ui/Button/Button';
import { DialogActions } from '@/ui/DialogActions/DialogActions';
import { DialogHeader } from '@/ui/DialogHeader/DialogHeader';
import { FormError } from '@/ui/FormError/FormError';
import { Modal } from '@/ui/Modal/Modal';

import styles from './LeaveBoardConfirm.module.css';

const TITLE_ID = 'leave-board-confirm-title';

interface LeaveBoardConfirmProps {
  boardId: string;
  boardName: string;
  onCancel: () => void;
  onLeft: () => void;
}

export const LeaveBoardConfirm = ({
  boardId,
  boardName,
  onCancel,
  onLeft,
}: LeaveBoardConfirmProps): JSX.Element => {
  const leaveBoard = useLeaveBoard();
  const [failed, setFailed] = useState(false);

  const confirm = async (): Promise<void> => {
    setFailed(false);
    try {
      await leaveBoard.mutateAsync({ boardId });
      onLeft();
    } catch {
      setFailed(true);
    }
  };

  return (
    <Modal onClose={onCancel} labelledBy={TITLE_ID} size="sm" padded>
      <DialogHeader
        title={`Leave "${boardName}"?`}
        subtitle="The board leaves your list. Only its owner can share it with you again."
        titleId={TITLE_ID}
        onClose={onCancel}
      />
      {failed && (
        <FormError className={styles.errorGap}>
          Could not leave the board. Check your connection and try again.
        </FormError>
      )}
      <DialogActions>
        <Button variant="ghost" onClick={onCancel} disabled={leaveBoard.isPending}>
          Cancel
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            void confirm();
          }}
          disabled={leaveBoard.isPending}
        >
          {leaveBoard.isPending ? 'Leaving…' : 'Leave board'}
        </Button>
      </DialogActions>
    </Modal>
  );
};
