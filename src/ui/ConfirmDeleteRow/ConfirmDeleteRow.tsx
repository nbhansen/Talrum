import { type JSX, useState } from 'react';

import { Button } from '@/ui/Button/Button';
import { TrashIcon } from '@/ui/icons';

import styles from './ConfirmDeleteRow.module.css';

interface ConfirmDeleteRowProps {
  /** Idle-state button text, e.g. "Delete pictogram". */
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
}

/**
 * Two-step destructive action shared by the edit sheets: a ghost button
 * that arms the row, then Cancel / "Delete forever". Arming is local UI
 * state — closing the dialog discards it.
 */
export const ConfirmDeleteRow = ({
  label,
  onConfirm,
  disabled = false,
}: ConfirmDeleteRowProps): JSX.Element => {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className={styles.actions}>
      {confirming ? (
        <>
          <Button variant="ghost" onClick={() => setConfirming(false)} disabled={disabled}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className={styles.dangerBtn}
            icon={<TrashIcon size={14} />}
            onClick={onConfirm}
            disabled={disabled}
          >
            Delete forever
          </Button>
        </>
      ) : (
        <Button
          variant="ghost"
          icon={<TrashIcon size={14} />}
          onClick={() => setConfirming(true)}
          disabled={disabled}
        >
          {label}
        </Button>
      )}
    </div>
  );
};
