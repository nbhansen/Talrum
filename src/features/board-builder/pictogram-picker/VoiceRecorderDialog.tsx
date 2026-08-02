import { type JSX, useCallback, useEffect, useState } from 'react';

import { playPictogramAudio } from '@/lib/audio';
import { useClearPictogramAudio, useSetPictogramAudio } from '@/lib/queries/pictograms';
import {
  extensionForMime,
  isRecordingSupported,
  MAX_RECORDING_MS,
  type Recording,
  startRecording,
} from '@/lib/recording';
import type { Pictogram } from '@/types/domain';
import { Button } from '@/ui/Button/Button';
import { DialogHeader } from '@/ui/DialogHeader/DialogHeader';
import { MicIcon, PlayIcon, StopIcon, TrashIcon } from '@/ui/icons';
import { Modal } from '@/ui/Modal/Modal';
import { PictogramMedia } from '@/widgets/PictoTile/PictogramMedia';

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
  // mutateAsync is referentially stable; depending on `saveMut` itself would
  // recreate `stop` every render and reset the cap timer below.
  const { mutateAsync: saveAudio } = saveMut;
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

  const stop = useCallback(async (): Promise<void> => {
    if (!rec) return;
    setMode('uploading');
    try {
      const blob = await rec.stop();
      setRec(null);
      await saveAudio({
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
  }, [rec, saveAudio, picto.id, picto.audioPath]);

  // Save automatically when the duration cap fires (#416). The recorder
  // stops itself at MAX_RECORDING_MS either way; without this timer the
  // dialog would keep showing "Recording…" over a recorder that already
  // stopped, and a later Stop press would save a clip the user thinks is
  // longer than it is.
  useEffect(() => {
    if (mode !== 'recording') return undefined;
    const timer = setTimeout(() => {
      void stop();
    }, MAX_RECORDING_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [mode, stop]);

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
      <div className={styles.headerWrap}>
        <DialogHeader
          title="Record voice"
          subtitle={
            <>
              This voice plays for <strong>{picto.label}</strong> when a board uses &ldquo;Parent
              voice&rdquo;.
            </>
          }
          titleId={TITLE_ID}
          onClose={onClose}
        />
      </div>
      <div className={styles.body}>
        <div className={styles.preview}>
          <PictogramMedia picto={picto} size={180} />
        </div>
        <div className={styles.status}>
          {mode === 'recording' ? (
            <span className={styles.recDot} aria-live="polite">
              Recording… Stops after {MAX_RECORDING_MS / 1000} seconds.
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
