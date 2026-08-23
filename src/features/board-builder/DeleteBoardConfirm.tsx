import { type JSX, useState } from 'react';

import { useDeleteBoard } from '@/lib/queries/boards';
import { Button } from '@/ui/Button/Button';
import { DialogActions } from '@/ui/DialogActions/DialogActions';
import { DialogHeader } from '@/ui/DialogHeader/DialogHeader';
import { Modal } from '@/ui/Modal/Modal';

import styles from './DeleteBoardConfirm.module.css';

const TITLE_ID = 'delete-board-confirm-title';

interface DeleteBoardConfirmProps {
  boardId: string;
  boardName: string;
  onCancel: () => void;
  onDeleted: () => void;
}

export const DeleteBoardConfirm = ({
  boardId,
  boardName,
  onCancel,
  onDeleted,
}: DeleteBoardConfirmProps): JSX.Element => {
  const deleteBoard = useDeleteBoard();
  const [error, setError] = useState<string | null>(null);

  const confirm = async (): Promise<void> => {
    setError(null);
    try {
      await deleteBoard.mutateAsync({ boardId });
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the board.');
    }
  };

  return (
    <Modal onClose={onCancel} labelledBy={TITLE_ID} size="sm">
      <div className={styles.wrap}>
        <DialogHeader
          title={`Delete "${boardName}"?`}
          subtitle="It disappears for everyone it is shared with. Pictograms stay in your library."
          titleId={TITLE_ID}
          onClose={onCancel}
        />
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <DialogActions>
          <Button variant="ghost" onClick={onCancel} disabled={deleteBoard.isPending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              void confirm();
            }}
            disabled={deleteBoard.isPending}
          >
            {deleteBoard.isPending ? 'Deleting…' : 'Delete forever'}
          </Button>
        </DialogActions>
      </div>
    </Modal>
  );
};
