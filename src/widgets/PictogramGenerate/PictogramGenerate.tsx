import { type JSX, useEffect, useRef, useState } from 'react';

import { cropToSquareJpeg, type ProcessedImage } from '@/lib/image';
import { GenerateImageError, useGenerateImage } from '@/lib/queries/generateImage';
import { useCreatePhotoPictogram } from '@/lib/queries/pictograms';
import { Button } from '@/ui/Button/Button';
import { SparkleIcon } from '@/ui/icons';

import styles from './PictogramGenerate.module.css';

/**
 * The Generate tab of the pictogram picker (#422): label in, image out,
 * behind a preview. The preview is what will be saved — the generated image
 * goes through the same crop-to-square pipeline as an uploaded photo before
 * it is shown, and Save hands the exact previewed blob to the normal
 * create-photo outbox path. Nothing is stored anywhere until Save.
 */
export const PictogramGenerate = (): JSX.Element => {
  const [label, setLabel] = useState('');
  const [preview, setPreview] = useState<ProcessedImage | null>(null);
  const [busy, setBusy] = useState<'generating' | 'saving' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const genMut = useGenerateImage();
  const createPhoto = useCreatePhotoPictogram();

  // Leaving the tab mid-generation must not leak: a blob URL created for a
  // dropped setPreview would never reach the cleanup effect below. The
  // setup body must re-assert true — StrictMode runs setup → cleanup →
  // setup on a dev mount (#433 review).
  const openRef = useRef(true);
  useEffect(() => {
    openRef.current = true;
    return () => {
      openRef.current = false;
    };
  }, []);

  // The preview's blob URL must not outlive the preview (or the tab).
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.previewUrl);
    };
  }, [preview]);

  const generate = async (): Promise<void> => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setError(null);
    setBusy('generating');
    try {
      const blob = await genMut.mutateAsync({ label: trimmed });
      const processed = await cropToSquareJpeg(blob);
      if (!openRef.current) {
        URL.revokeObjectURL(processed.previewUrl);
        return;
      }
      // The state swap revokes the previous preview's URL via the effect above.
      setPreview(processed);
    } catch (err) {
      // Only a request that never got a response blames the connection; any
      // other failure — server-side or a crop/decode error on the returned
      // bytes — told to "check your connection" sends the parent chasing
      // wifi that is fine. Retry is still the right advice for those:
      // generation is non-deterministic, so the next attempt may decode.
      setError(
        err instanceof GenerateImageError && err.code === 'network'
          ? 'Could not generate an image. Check your connection and try again.'
          : 'Image generation failed. Try again in a moment.',
      );
    } finally {
      setBusy(null);
    }
  };

  const save = async (): Promise<void> => {
    if (!preview) return;
    setError(null);
    setBusy('saving');
    try {
      await createPhoto.mutateAsync({
        label: label.trim(),
        blob: preview.blob,
        extension: preview.extension,
      });
      setPreview(null);
      setLabel('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setBusy(null);
    }
  };

  const discard = (): void => {
    setPreview(null);
  };

  return (
    <div className={styles.wrap}>
      {preview ? (
        <div className={styles.preview}>
          <img src={preview.previewUrl} alt="" className={styles.previewImg} />
          <div className={styles.previewSide}>
            <div className={styles.title}>{label.trim()}</div>
            <div className={styles.hint}>
              This is how the pictogram will look. Save it, or discard and generate again.
            </div>
            {error && <div className={styles.error}>{error}</div>}
            <div className={styles.previewActions}>
              <Button variant="ghost" onClick={discard} disabled={busy !== null}>
                Discard
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  void save();
                }}
                disabled={busy !== null}
              >
                {busy === 'saving' ? 'Saving…' : 'Add to library'}
              </Button>
            </div>
          </div>
        </div>
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
          <label className={styles.labelField}>
            <span className={styles.labelHint}>Label</span>
            <input
              type="text"
              className={styles.labelInput}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Vente (waiting)"
              maxLength={40}
              disabled={busy !== null}
            />
          </label>
          {error && <div className={styles.error}>{error}</div>}
          <div className={styles.formActions}>
            <Button
              variant="primary"
              onClick={() => {
                void generate();
              }}
              disabled={busy !== null || !label.trim()}
            >
              <SparkleIcon size={14} /> {busy === 'generating' ? 'Generating…' : 'Generate image'}
            </Button>
          </div>
          {busy === 'generating' && (
            <div className={styles.hint} aria-live="polite">
              This can take up to a minute.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
