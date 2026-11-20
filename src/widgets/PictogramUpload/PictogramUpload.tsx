import { type JSX, useState } from 'react';

import { captureException } from '@/lib/platform/telemetry';
import { useAddPhotoPictogram, usePictograms } from '@/lib/queries/pictograms';
import { isUploadedStoragePath } from '@/lib/storage';
import { useImagePicker } from '@/lib/useImagePicker';
import type { Pictogram } from '@/types/domain';
import { Button } from '@/ui/Button/Button';
import { FormError } from '@/ui/FormError/FormError';
import { UploadIcon } from '@/ui/icons';
import { PhotoPreviewCard } from '@/ui/PhotoPreviewCard/PhotoPreviewCard';
import { TextField } from '@/ui/TextField/TextField';
import { PictoTile } from '@/widgets/PictoTile/PictoTile';

import styles from './PictogramUpload.module.css';

const RECENT_LIMIT = 6;

interface PictogramUploadProps {
  /** Library to create in; omitted means the signed-in user's own (#490). */
  ownerId?: string;
}

export const PictogramUpload = ({ ownerId }: PictogramUploadProps): JSX.Element => {
  const {
    fileInputRef,
    processed,
    processing,
    error: pickError,
    pickFile,
    onInputChange,
    reset: resetPick,
  } = useImagePicker();
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { data: pictograms = [] } = usePictograms();
  const { add, isPending: uploading } = useAddPhotoPictogram(ownerId);

  const shownError = error ?? pickError;

  const reset = (): void => {
    resetPick();
    setLabel('');
    setError(null);
  };

  const upload = async (): Promise<void> => {
    if (!processed) return;
    const trimmed = label.trim();
    if (!trimmed) {
      setError('Give the photo a short label.');
      return;
    }
    setError(null);
    try {
      await add(trimmed, processed);
      reset();
    } catch (err) {
      captureException(err, { tags: { component: 'PictogramUpload', op: 'upload' } });
      setError('Upload failed.');
    }
  };

  // "Your uploads" only — exclude photo-style templates that ship as either a
  // `stock:<slug>` sentinel (resolved to a bundled JPG by PictogramMedia) or
  // an unfilled placeholder (image_path null). The user hasn't uploaded those.
  const recentPhotos = pictograms
    .filter(
      (p: Pictogram): p is Extract<Pictogram, { style: 'photo' }> =>
        p.style === 'photo' && isUploadedStoragePath(p.imagePath),
    )
    .slice(-RECENT_LIMIT)
    .reverse();

  return (
    <div className={styles.wrap}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className={styles.fileInput}
        onChange={onInputChange}
      />
      {processed ? (
        <PhotoPreviewCard
          src={processed.previewUrl}
          actions={
            <>
              <Button variant="ghost" onClick={reset} disabled={uploading}>
                Choose another
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  void upload();
                }}
                disabled={uploading || !label.trim()}
              >
                {uploading ? 'Uploading…' : 'Add to library'}
              </Button>
            </>
          }
        >
          <TextField
            label="Label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Cereal bowl"
            maxLength={40}
          />
          {shownError && <FormError>{shownError}</FormError>}
        </PhotoPreviewCard>
      ) : (
        <button type="button" className={styles.dropzone} onClick={pickFile} disabled={processing}>
          <div className={styles.iconCircle}>
            <UploadIcon size={28} />
          </div>
          <div className={styles.title}>
            {processing ? 'Preparing photo…' : 'Tap to choose a photo'}
          </div>
          <div className={styles.hint}>
            Real photos of cereal, shoes, or bed work best. We crop to a square automatically.
          </div>
          {shownError && <FormError>{shownError}</FormError>}
        </button>
      )}
      {recentPhotos.length > 0 && (
        <>
          <div className={styles.recentHeading}>Your uploads</div>
          <div className={styles.recentRow}>
            {recentPhotos.map((p) => (
              <PictoTile key={p.id} picto={p} size={100} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};
