import { type JSX, useState } from 'react';

import { usePictograms } from '@/lib/queries/pictograms';
import type { Pictogram } from '@/types/domain';
import { Button } from '@/ui/Button/Button';
import { DialogHeader } from '@/ui/DialogHeader/DialogHeader';
import { Modal } from '@/ui/Modal/Modal';
import { PictogramGenerate } from '@/widgets/PictogramGenerate/PictogramGenerate';
import { PictogramUpload } from '@/widgets/PictogramUpload/PictogramUpload';

import styles from './PictoPicker.module.css';
import { LibraryTab } from './tabs/LibraryTab';
import { VoiceRecorderDialog } from './VoiceRecorderDialog';

type PickerTab = 'library' | 'upload' | 'generate';

interface TabDef {
  value: PickerTab;
  label: string;
  sub: string;
}

interface PictoPickerProps {
  /** Owner of the board being edited; new pictograms join their library (#490). */
  ownerId?: string;
  onClose: () => void;
  onConfirm?: (selectedIds: readonly string[]) => void;
}

const TITLE_ID = 'tal-picker-title';

export const PictoPicker = ({ ownerId, onClose, onConfirm }: PictoPickerProps): JSX.Element => {
  const [tab, setTab] = useState<PickerTab>('library');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState('');
  const [editingVoice, setEditingVoice] = useState<Pictogram | null>(null);
  const { data: pictograms = [], isPending } = usePictograms();
  const tabs: readonly TabDef[] = [
    { value: 'library', label: 'Library', sub: isPending ? '' : `${pictograms.length}` },
    { value: 'upload', label: 'Upload', sub: 'Photo / image' },
    { value: 'generate', label: 'Generate', sub: 'AI image' },
  ];
  // Keep the dialog's pictogram in sync with the query cache so `audio_path`
  // updates (record → save, delete) flow through without remounting.
  const editingVoiceLive = editingVoice
    ? (pictograms.find((p) => p.id === editingVoice.id) ?? editingVoice)
    : null;

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirm = (): void => {
    onConfirm?.([...selected]);
    onClose();
  };

  return (
    <Modal onClose={onClose} labelledBy={TITLE_ID}>
      <div className={styles.headerWrap}>
        <DialogHeader
          title="Add pictograms"
          subtitle="Pick from the library, upload a photo, or generate an image."
          titleId={TITLE_ID}
          onClose={onClose}
          closeLabel="Close picker"
        />
      </div>
      <div className={styles.tabs} role="tablist">
        {tabs.map((t) => {
          const active = tab === t.value;
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={active}
              className={[styles.tab, active && styles.tabActive].filter(Boolean).join(' ')}
              onClick={() => setTab(t.value)}
            >
              {t.label}
              <span className={styles.tabSub}>{t.sub}</span>
            </button>
          );
        })}
      </div>
      <div className={styles.body}>
        {tab === 'library' && (
          <LibraryTab
            pictograms={pictograms}
            query={query}
            onQueryChange={setQuery}
            selected={selected}
            onToggle={toggle}
            onEditVoice={setEditingVoice}
          />
        )}
        {tab === 'upload' && <PictogramUpload {...(ownerId ? { ownerId } : {})} />}
        {tab === 'generate' && <PictogramGenerate {...(ownerId ? { ownerId } : {})} />}
      </div>
      <footer className={styles.footer}>
        <div className={styles.footerCount}>{selected.size} selected</div>
        <div className={styles.footerActions}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={confirm}>
            Add {selected.size > 0 ? selected.size : ''} to board
          </Button>
        </div>
      </footer>
      {editingVoiceLive && (
        <VoiceRecorderDialog picto={editingVoiceLive} onClose={() => setEditingVoice(null)} />
      )}
    </Modal>
  );
};
