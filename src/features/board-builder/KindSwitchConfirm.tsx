import type { JSX } from 'react';

import type { BoardKind } from '@/types/domain';
import { Button } from '@/ui/Button/Button';
import { DialogActions } from '@/ui/DialogActions/DialogActions';
import { DialogHeader } from '@/ui/DialogHeader/DialogHeader';
import { Modal } from '@/ui/Modal/Modal';

import styles from './KindSwitchConfirm.module.css';

const TITLE_ID = 'kind-switch-confirm-title';

interface KindSwitchConfirmProps {
  current: BoardKind;
  next: BoardKind;
  onConfirm: () => void;
  onCancel: () => void;
}

// TODO(#236): replace with kindLabel from src/lib/boardKindVocab once #238 merges.
const label = (kind: BoardKind): string => (kind === 'sequence' ? 'Sequence' : 'Choice');

const BODY: Record<BoardKind, string> = {
  sequence:
    'Tiles become an ordered step list. The "Kid can reorder" toggle becomes available. Choice-only OR grouping no longer applies in kid mode.',
  choice:
    'Tiles become alternatives separated by OR. Step ordering is no longer enforced and the "Kid can reorder" toggle is hidden.',
};

export const KindSwitchConfirm = ({
  current,
  next,
  onConfirm,
  onCancel,
}: KindSwitchConfirmProps): JSX.Element => (
  <Modal onClose={onCancel} labelledBy={TITLE_ID}>
    <div className={styles.wrap}>
      <DialogHeader
        title={`Switch to ${label(next)}?`}
        subtitle={`This board is currently a ${label(current)} board. Switching changes how kids interact with it.`}
        titleId={TITLE_ID}
        onClose={onCancel}
      />
      <p className={styles.body}>{BODY[next]}</p>
      <DialogActions>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" variant="primary" onClick={onConfirm}>
          Switch to {label(next)}
        </Button>
      </DialogActions>
    </div>
  </Modal>
);
