import { type JSX, useState } from 'react';

import { cropToSquareJpeg, type ProcessedImage } from '@/lib/image';
import { getAppLanguage } from '@/lib/language';
import { captureException } from '@/lib/platform/telemetry';
import { isGenerateImageError, useGenerateImage } from '@/lib/queries/generateImage';
import { useAddPhotoPictogram } from '@/lib/queries/pictograms';
import { useBlobPreview } from '@/lib/useBlobPreview';
import { Button } from '@/ui/Button/Button';
import { FormError } from '@/ui/FormError/FormError';
import { SparkleIcon } from '@/ui/icons';
import { PhotoPreviewCard } from '@/ui/PhotoPreviewCard/PhotoPreviewCard';
import { TextField } from '@/ui/TextField/TextField';

import styles from './PictogramGenerate.module.css';

/**
 * The Generate tab of the pictogram picker (#422). The preview is exactly what
 * Save writes: the generated image goes through the same crop pipeline as an
 * upload, and Save hands that blob to the normal create-photo path.
 */
interface PictogramGenerateProps {
  /** Library to create in; omitted means the signed-in user's own (#490). */
  ownerId?: string;
}

export const PictogramGenerate = ({ ownerId }: PictogramGenerateProps): JSX.Element => {
  const [label, setLabel] = useState('');
  const { preview, show: showPreview, clear: clearPreview } = useBlobPreview<ProcessedImage>();
  // Not genMut.isPending: the crop after the request is part of generating.
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const genMut = useGenerateImage();
  const { add, isPending: saving } = useAddPhotoPictogram(ownerId);
  const busy = generating || saving;

  const generate = async (): Promise<void> => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setError(null);
    setGenerating(true);
    try {
      const blob = await genMut.mutateAsync({ label: trimmed, language: getAppLanguage() });
      const processed = await cropToSquareJpeg(blob);
      showPreview(processed);
    } catch (err) {
      // Only a request that got no response blames the connection. Telling a
      // parent to check wifi that is fine sends them chasing the wrong thing.
      // Retry stays the advice either way: generation is non-deterministic.
      const code = isGenerateImageError(err) ? err.code : null;
      setError(
        code === 'not_configured'
          ? 'Image generation is not set up on this server.'
          : code === 'network'
            ? 'Could not generate an image. Check your connection and try again.'
            : 'Image generation failed. Try again in a moment.',
      );
    } finally {
      setGenerating(false);
    }
  };

  const save = async (): Promise<void> => {
    if (!preview) return;
    setError(null);
    try {
      await add(label.trim(), preview);
      clearPreview();
      setLabel('');
    } catch (err) {
      captureException(err, { tags: { component: 'PictogramGenerate', op: 'save' } });
      setError('Save failed.');
    }
  };

  const discard = (): void => {
    clearPreview();
    setError(null);
  };

  return (
    <div className={styles.wrap}>
      {preview ? (
        <PhotoPreviewCard
          src={preview.previewUrl}
          actions={
            <>
              <Button variant="ghost" onClick={discard} disabled={busy}>
                Discard
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  void save();
                }}
                disabled={busy}
              >
                {saving ? 'Saving…' : 'Add to library'}
              </Button>
            </>
          }
        >
          <div className={styles.title}>{label.trim()}</div>
          <div className={styles.hint}>
            This is how the pictogram will look. Save it, or discard and generate again.
          </div>
          {error && <FormError>{error}</FormError>}
        </PhotoPreviewCard>
      ) : (
        <div className={styles.form}>
          <div className={styles.iconCircle}>
            <SparkleIcon size={28} />
          </div>
          <div className={styles.title}>Generate a pictogram image</div>
          <div className={styles.hint}>
            Type what the pictogram shows. We draw it in the same flat style every time, so
            generated pictograms look like one set.
          </div>
          <div className={styles.labelField}>
            <TextField
              label="Label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Vente (waiting)"
              maxLength={40}
              disabled={busy}
            />
          </div>
          {error && <FormError>{error}</FormError>}
          <div className={styles.formActions}>
            <Button
              variant="primary"
              onClick={() => {
                void generate();
              }}
              disabled={busy || !label.trim()}
            >
              <SparkleIcon size={14} /> {generating ? 'Generating…' : 'Generate image'}
            </Button>
          </div>
          {generating && (
            <div className={styles.hint} aria-live="polite">
              This can take up to a minute.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
