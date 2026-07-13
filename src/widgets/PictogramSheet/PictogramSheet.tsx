import { type JSX, useMemo, useState } from 'react';

import { useBoards } from '@/lib/queries/boards.read';
import {
  referencingBoardIds,
  useDeletePictogram,
  useRenamePictogram,
  useReplacePictogramImage,
} from '@/lib/queries/pictograms';
import { useImagePicker } from '@/lib/useImagePicker';
import type { Pictogram } from '@/types/domain';
import { Button } from '@/ui/Button/Button';
import { ConfirmDeleteRow } from '@/ui/ConfirmDeleteRow/ConfirmDeleteRow';
import { UploadIcon, XIcon } from '@/ui/icons';
import { Modal } from '@/ui/Modal/Modal';
import { PictogramMedia } from '@/ui/PictoTile/PictogramMedia';

import styles from './PictogramSheet.module.css';

interface Props {
  picto: Pictogram;
  onClose: () => void;
}

const TITLE_ID = 'tal-pictogram-sheet-title';
const LABEL_MAX = 40;

export const PictogramSheet = ({ picto, onClose }: Props): JSX.Element => {
  const [label, setLabel] = useState(picto.label);
  const [error, setError] = useState<string | null>(null);
  const {
    fileInputRef,
    processed,
    processing,
    error: pickError,
    pickFile,
    onInputChange,
  } = useImagePicker();

  const renameMut = useRenamePictogram();
  const replaceMut = useReplacePictogramImage();
  const deleteMut = useDeletePictogram();
  const { data: boards } = useBoards();
  const referencedBoardIds = useMemo(
    () => referencingBoardIds(picto.id, boards),
    [picto.id, boards],
  );

  const trimmedLabel = label.trim();
  const labelDirty = trimmedLabel.length > 0 && trimmedLabel !== picto.label;
  const saving = renameMut.isPending || replaceMut.isPending || deleteMut.isPending;
  const busy = processing || saving;
  const shownError = error ?? pickError;

  const onSaveLabel = async (): Promise<void> => {
    if (!labelDirty) return;
    setError(null);
    try {
      await renameMut.mutateAsync({ pictogramId: picto.id, label: trimmedLabel });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rename failed.');
    }
  };

  const onSavePhoto = async (): Promise<void> => {
    if (!processed || picto.style !== 'photo') return;
    setError(null);
    try {
      await replaceMut.mutateAsync({
        pictogramId: picto.id,
        blob: processed.blob,
        extension: processed.extension,
        ...(picto.imagePath ? { previousPath: picto.imagePath } : {}),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo replace failed.');
    }
  };

  const onDelete = async (): Promise<void> => {
    setError(null);
    try {
      await deleteMut.mutateAsync({
        pictogramId: picto.id,
        ...(picto.style === 'photo' && picto.imagePath
          ? { previousImagePath: picto.imagePath }
          : {}),
        ...(picto.audioPath ? { previousAudioPath: picto.audioPath } : {}),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  return (
    <Modal onClose={onClose} labelledBy={TITLE_ID}>
      <header className={styles.header}>
        <div>
          <h2 id={TITLE_ID} className={styles.title}>
            Edit pictogram
          </h2>
          <p className={styles.subtitle}>Rename, replace the photo, or delete it.</p>
        </div>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
          <XIcon size={16} />
        </button>
      </header>

      <div className={styles.body}>
        <div className={styles.preview}>
          <PictogramMedia picto={picto} size={140} />
        </div>

        <section className={styles.section}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Label</span>
            <input
              className={styles.input}
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={LABEL_MAX}
              disabled={busy}
            />
          </label>
          <div className={styles.sectionActions}>
            <Button
              variant="primary"
              onClick={() => {
                void onSaveLabel();
              }}
              disabled={!labelDirty || busy}
            >
              {renameMut.isPending ? 'Saving…' : 'Save label'}
            </Button>
          </div>
        </section>

        {picto.style === 'photo' && (
          <section className={styles.section}>
            <div className={styles.fieldLabel}>Photo</div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className={styles.fileInput}
              onChange={(e) => {
                // Picking a file starts a fresh attempt — clear stale
                // rename/replace/delete errors like the pre-hook code did.
                setError(null);
                onInputChange(e);
              }}
            />
            {processed ? (
              <div className={styles.photoPreview}>
                <img src={processed.previewUrl} alt="" className={styles.photoPreviewImg} />
                <Button variant="ghost" onClick={pickFile} disabled={busy}>
                  Choose another
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                icon={<UploadIcon size={16} />}
                onClick={pickFile}
                disabled={busy}
              >
                {processing ? 'Preparing…' : 'Choose a new photo'}
              </Button>
            )}
            <div className={styles.sectionActions}>
              <Button
                variant="primary"
                onClick={() => {
                  void onSavePhoto();
                }}
                disabled={!processed || busy}
              >
                Replace photo
              </Button>
            </div>
          </section>
        )}

        <section className={styles.dangerSection}>
          <div className={styles.fieldLabel}>Delete</div>
          {referencedBoardIds.length > 0 && (
            <p className={styles.dangerHint}>
              Used on {referencedBoardIds.length} board
              {referencedBoardIds.length === 1 ? '' : 's'}. Deleting removes it from{' '}
              {referencedBoardIds.length === 1 ? 'that board' : 'those boards'} too.
            </p>
          )}
          <ConfirmDeleteRow
            label="Delete pictogram"
            onConfirm={() => {
              void onDelete();
            }}
            disabled={busy}
          />
        </section>

        {shownError && <div className={styles.error}>{shownError}</div>}
      </div>
    </Modal>
  );
};
