import type { JSX } from 'react';

import { DialogHeader } from '@/ui/DialogHeader/DialogHeader';
import { Modal } from '@/ui/Modal/Modal';
import { PictogramUpload } from '@/widgets/PictogramUpload/PictogramUpload';

import styles from './NewPictogramModal.module.css';

const TITLE_ID = 'new-pictogram-modal-title';

interface NewPictogramModalProps {
  onClose: () => void;
}

export const NewPictogramModal = ({ onClose }: NewPictogramModalProps): JSX.Element => (
  <Modal onClose={onClose} labelledBy={TITLE_ID}>
    <div className={styles.headerWrap}>
      <DialogHeader
        title="Add a pictogram"
        subtitle="Upload a photo — it lands in your library, ready for any board."
        titleId={TITLE_ID}
        onClose={onClose}
      />
    </div>
    <div className={styles.body}>
      <PictogramUpload />
    </div>
  </Modal>
);
