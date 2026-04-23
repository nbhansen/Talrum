import { type JSX, useState } from 'react';

import { PICTOGRAMS } from '@/data/pictograms';
import { Button } from '@/ui/Button/Button';
import { XIcon } from '@/ui/icons';
import { Modal } from '@/ui/Modal/Modal';

import styles from './PictoPicker.module.css';
import { GenerateTab } from './tabs/GenerateTab';
import { LibraryTab } from './tabs/LibraryTab';
import { UploadTab } from './tabs/UploadTab';

type PickerTab = 'library' | 'upload' | 'ai';

interface TabDef {
  value: PickerTab;
  label: string;
  sub: string;
}

const TABS: readonly TabDef[] = [
  { value: 'library', label: 'Library', sub: '1,400+' },
  { value: 'upload', label: 'Upload', sub: 'Photo / image' },
  { value: 'ai', label: 'Generate', sub: 'Describe it' },
];

interface PictoPickerProps {
  onClose: () => void;
  onConfirm?: (selectedIds: readonly string[]) => void;
}

const TITLE_ID = 'tal-picker-title';

export const PictoPicker = ({ onClose, onConfirm }: PictoPickerProps): JSX.Element => {
  const [tab, setTab] = useState<PickerTab>('library');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set(['apple', 'cup']));
  const [query, setQuery] = useState('');

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
      <header className={styles.header}>
        <div>
          <h2 id={TITLE_ID} className={styles.title}>
            Add pictograms
          </h2>
          <p className={styles.subtitle}>
            Pick from the library, upload a photo, or generate one.
          </p>
        </div>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close picker"
        >
          <XIcon size={16} />
        </button>
      </header>
      <div className={styles.tabs} role="tablist">
        {TABS.map((t) => {
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
            pictograms={Object.values(PICTOGRAMS)}
            query={query}
            onQueryChange={setQuery}
            selected={selected}
            onToggle={toggle}
          />
        )}
        {tab === 'upload' && <UploadTab />}
        {tab === 'ai' && <GenerateTab />}
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
    </Modal>
  );
};
