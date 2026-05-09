import { type ChangeEvent, type JSX, useEffect, useMemo, useRef, useState } from 'react';

import { cropToSquareJpeg, type ProcessedImage } from '@/lib/image';
import { useBoards } from '@/lib/queries/boards.read';
import {
  referencingBoardIds,
  useDeletePictogram,
  useRenamePictogram,
  useReplacePictogramImage,
} from '@/lib/queries/pictograms';
import type { Pictogram } from '@/types/domain';
import { Button } from '@/ui/Button/Button';
import { TrashIcon, UploadIcon, XIcon } from '@/ui/icons';
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
  const [processed, setProcessed] = useState<ProcessedImage | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const renameMut = useRenamePictogram();
  const replaceMut = useReplacePictogramImage();
  const deleteMut = useDeletePictogram();
  const { data: boards } = useBoards();
  const referencedBoardIds = useMemo(
    () => referencingBoardIds(picto.id, boards),
    [picto.id, boards],
  );

  useEffect(
    () => () => {
      if (processed) URL.revokeObjectURL(processed.previewUrl);
    },
    [processed],
  );

  const trimmedLabel = label.trim();
  const labelDirty = trimmedLabel.length > 0 && trimmedLabel !== picto.label;
  const saving = renameMut.isPending || replaceMut.isPending || deleteMut.isPending;
  const busy = processing || saving;

  const onPickFile = (): void => fileInputRef.current?.click();

  const onFile = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!file) return;
    setError(null);
    if (processed) URL.revokeObjectURL(processed.previewUrl);
    setProcessed(null);
    setProcessing(true);
    try {
      setProcessed(await cropToSquareJpeg(file));
    } catch {
      setError('Could not read that image. Try a JPG or PNG.');
    } finally {
      setProcessing(false);
    }
  };

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
        scrubFromBoardIds: referencedBoardIds,
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
          <p className={styles.subtitle}>
            Rename, replace the photo, or delete <strong>{picto.label}</strong>.
          </p>
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
                void onFile(e);
              }}
            />
            {processed ? (
              <div className={styles.photoPreview}>
                <img src={processed.previewUrl} alt="" className={styles.photoPreviewImg} />
                <Button variant="ghost" onClick={onPickFile} disabled={busy}>
                  Choose another
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                icon={<UploadIcon size={16} />}
                onClick={onPickFile}
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
              {referencedBoardIds.length === 1 ? '' : 's'}. Deleting removes it from those boards
              too.
            </p>
          )}
          <div className={styles.sectionActions}>
            {confirmDelete ? (
              <>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  className={styles.dangerBtn}
                  icon={<TrashIcon size={14} />}
                  onClick={() => {
                    void onDelete();
                  }}
                  disabled={busy}
                >
                  Delete forever
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                icon={<TrashIcon size={14} />}
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
              >
                Delete pictogram
              </Button>
            )}
          </div>
        </section>

        {error && <div className={styles.error}>{error}</div>}
      </div>
    </Modal>
  );
};
