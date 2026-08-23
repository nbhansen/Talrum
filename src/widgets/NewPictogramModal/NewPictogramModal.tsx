import { type JSX, useState } from 'react';

import { DialogHeader } from '@/ui/DialogHeader/DialogHeader';
import { Modal } from '@/ui/Modal/Modal';
import { type TabItem, Tabs } from '@/ui/Tabs/Tabs';
import { PictogramGenerate } from '@/widgets/PictogramGenerate/PictogramGenerate';
import { PictogramUpload } from '@/widgets/PictogramUpload/PictogramUpload';

import styles from './NewPictogramModal.module.css';

const TITLE_ID = 'new-pictogram-modal-title';

type Source = 'upload' | 'generate';

const TABS: readonly TabItem<Source>[] = [
  { id: 'upload', label: 'Upload', sub: 'Photo / image' },
  { id: 'generate', label: 'Generate', sub: 'AI image' },
];

interface NewPictogramModalProps {
  onClose: () => void;
}

export const NewPictogramModal = ({ onClose }: NewPictogramModalProps): JSX.Element => {
  const [source, setSource] = useState<Source>('upload');
  return (
    <Modal onClose={onClose} labelledBy={TITLE_ID} size="md">
      <div className={styles.headerWrap}>
        <DialogHeader
          title="New pictogram"
          subtitle="Upload a photo or generate an image — it lands in your library, ready for any board."
          titleId={TITLE_ID}
          onClose={onClose}
        />
      </div>
      <div className={styles.tabs}>
        <Tabs items={TABS} value={source} onChange={setSource} />
      </div>
      {source === 'upload' ? <PictogramUpload /> : <PictogramGenerate />}
    </Modal>
  );
};
