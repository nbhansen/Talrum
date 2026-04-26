import { type JSX, useEffect, useState } from 'react';

import { playPictogramAudio } from '@/lib/audio';
import { useClearPictogramAudio, useSetPictogramAudio } from '@/lib/queries/pictograms';
import {
  extensionForMime,
  isRecordingSupported,
  type Recording,
  startRecording,
} from '@/lib/recording';
import type { Pictogram } from '@/types/domain';
import { Button } from '@/ui/Button/Button';
import { MicIcon, PlayIcon, StopIcon, TrashIcon, XIcon } from '@/ui/icons';
import { Modal } from '@/ui/Modal/Modal';
import { PictogramMedia } from '@/ui/PictoTile/PictogramMedia';

import styles from './VoiceRecorderDialog.module.css';

interface Props {
  picto: Pictogram;
  onClose: () => void;
}

type Mode = 'idle' | 'starting' | 'recording' | 'uploading' | 'playing';

const TITLE_ID = 'tal-voice-recorder-title';

export const VoiceRecorderDialog = ({ picto, onClose }: Props): JSX.Element => {
  const [mode, setMode] = useState<Mode>('idle');
  const [rec, setRec] = useState<Recording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saveMut = useSetPictogramAudio();
  const clearMut = useClearPictogramAudio();
  const supported = isRecordingSupported();
  const hasAudio = Boolean(picto.audioPath);

  useEffect(() => {
    return () => {
      rec?.cancel();
    };
  }, [rec]);

  const start = async (): Promise<void> => {
    setError(null);
    setMode('starting');
    try {
      const r = await startRecording();
      setRec(r);
      setMode('recording');
    } catch {
      setMode('idle');
      setError('Microphone unavailable. Grant permission and retry.');
    }
  };

  const stop = async (): Promise<void> => {
    if (!rec) return;
    setMode('uploading');
    try {
      const blob = await rec.stop();
      setRec(null);
      await saveMut.mutateAsync({
        pictogramId: picto.id,
        blob,
        extension: extensionForMime(blob.type),
        previousPath: picto.audioPath ?? null,
      });
      setMode('idle');
    } catch {
      setMode('idle');
      setError('Upload failed. Check your connection and try again.');
    }
  };

  const play = async (): Promise<void> => {
    if (!picto.audioPath) return;
    setError(null);
    setMode('playing');
    try {
      await playPictogramAudio(picto.audioPath);
    } catch {
      setError('Could not play recording.');
    } finally {
      setMode('idle');
    }
  };

  const del = async (): Promise<void> => {
    if (!picto.audioPath) return;
    setError(null);
    try {
      await clearMut.mutateAsync({ pictogramId: picto.id, path: picto.audioPath });
    } catch {
      setError('Could not remove recording.');
    }
  };

  const busy =
    mode === 'starting' || mode === 'uploading' || mode === 'playing' || clearMut.isPending;

  return (
    <Modal onClose={onClose} labelledBy={TITLE_ID}>
      <header className={styles.header}>
        <div>
          <h2 id={TITLE_ID} className={styles.title}>
            Record voice
          </h2>
          <p className={styles.subtitle}>
            This voice plays for <strong>{picto.label}</strong> when a board uses &ldquo;Parent
            voice&rdquo;.
          </p>
        </div>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
          <XIcon size={16} />
        </button>
      </header>
      <div className={styles.body}>
        <div className={styles.preview}>
          <PictogramMedia picto={picto} size={180} />
        </div>
        <div className={styles.status}>
          {mode === 'recording' ? (
            <span className={styles.recDot} aria-live="polite">
              Recording…
            </span>
          ) : hasAudio ? (
            <span className={styles.ok}>Recording saved ✓</span>
          ) : (
            <span className={styles.empty}>No recording yet.</span>
          )}
        </div>
        {error && <div className={styles.error}>{error}</div>}
        {!supported && (
          <div className={styles.error}>
            Your browser can&apos;t record audio. Try Chrome or Safari on the iPad.
          </div>
        )}
      </div>
      <footer className={styles.footer}>
        <div className={styles.footerLeft}>
          {hasAudio && mode !== 'recording' && (
            <>
              <Button variant="ghost" onClick={play} disabled={busy}>
                <PlayIcon size={12} /> Play
              </Button>
              <Button variant="ghost" onClick={del} disabled={busy}>
                <TrashIcon size={14} /> Delete
              </Button>
            </>
          )}
        </div>
        <div className={styles.footerRight}>
          {mode === 'recording' ? (
            <Button variant="primary" onClick={stop}>
              <StopIcon size={14} /> Stop
            </Button>
          ) : (
            <Button variant="primary" onClick={start} disabled={!supported || busy}>
              <MicIcon size={14} /> {hasAudio ? 'Re-record' : 'Record'}
            </Button>
          )}
        </div>
      </footer>
    </Modal>
  );
};
