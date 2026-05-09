import { type ChangeEvent, type JSX, useEffect, useRef, useState } from 'react';

import { cropToSquareJpeg, type ProcessedImage } from '@/lib/image';
import { useCreatePhotoPictogram, usePictograms } from '@/lib/queries/pictograms';
import type { Pictogram } from '@/types/domain';
import { Button } from '@/ui/Button/Button';
import { UploadIcon } from '@/ui/icons';
import { PictoTile } from '@/ui/PictoTile/PictoTile';

import styles from './UploadTab.module.css';

const RECENT_LIMIT = 6;

export const UploadTab = (): JSX.Element => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [processed, setProcessed] = useState<ProcessedImage | null>(null);
  const [label, setLabel] = useState('');
  const [status, setStatus] = useState<'idle' | 'processing' | 'uploading'>('idle');
  const [error, setError] = useState<string | null>(null);
  const { data: pictograms = [] } = usePictograms();
  const createPhoto = useCreatePhotoPictogram();

  useEffect(
    () => () => {
      if (processed) URL.revokeObjectURL(processed.previewUrl);
    },
    [processed],
  );

  const pickFile = (): void => fileInputRef.current?.click();

  const handleFile = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const chosen = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!chosen) return;
    setError(null);
    setFile(chosen);
    setStatus('processing');
    if (processed) URL.revokeObjectURL(processed.previewUrl);
    setProcessed(null);
    try {
      const next = await cropToSquareJpeg(chosen);
      setProcessed(next);
      if (!label) setLabel(chosen.name.replace(/\.[^.]+$/, '').slice(0, 40));
    } catch {
      setError('Could not read that image. Try a JPG or PNG.');
      setFile(null);
    } finally {
      setStatus('idle');
    }
  };

  const reset = (): void => {
    if (processed) URL.revokeObjectURL(processed.previewUrl);
    setProcessed(null);
    setFile(null);
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
    setStatus('uploading');
    setError(null);
    try {
      await createPhoto.mutateAsync({
        label: trimmed,
        blob: processed.blob,
        extension: processed.extension,
      });
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setStatus('idle');
    }
  };

  // "Your uploads" only — exclude photo-style templates that ship as either a
  // `stock:<slug>` sentinel (resolved to a bundled JPG by PictogramMedia) or
  // an unfilled placeholder (image_path null). The user hasn't uploaded those.
  const recentPhotos = pictograms
    .filter(
      (p: Pictogram): p is Extract<Pictogram, { style: 'photo' }> =>
        p.style === 'photo' && !!p.imagePath && !p.imagePath.startsWith('stock:'),
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
        onChange={(e) => {
          void handleFile(e);
        }}
      />
      {processed ? (
        <div className={styles.preview}>
          <img src={processed.previewUrl} alt="" className={styles.previewImg} />
          <div className={styles.previewSide}>
            <label className={styles.labelField}>
              <span className={styles.labelHint}>Label</span>
              <input
                type="text"
                className={styles.labelInput}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Cereal bowl"
                maxLength={40}
              />
            </label>
            {error && <div className={styles.error}>{error}</div>}
            <div className={styles.previewActions}>
              <Button variant="ghost" onClick={reset} disabled={status === 'uploading'}>
                Choose another
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  void upload();
                }}
                disabled={status === 'uploading' || !label.trim()}
              >
                {status === 'uploading' ? 'Uploading…' : 'Add to library'}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={styles.dropzone}
          onClick={pickFile}
          disabled={status === 'processing'}
        >
          <div className={styles.iconCircle}>
            <UploadIcon size={28} />
          </div>
          <div className={styles.title}>
            {status === 'processing' ? 'Preparing photo…' : 'Tap to choose a photo'}
          </div>
          <div className={styles.hint}>
            Real photos of {file?.name ? file.name : 'cereal, shoes, or bed'} work best. We crop to
            a square automatically.
          </div>
          {error && <div className={styles.error}>{error}</div>}
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
