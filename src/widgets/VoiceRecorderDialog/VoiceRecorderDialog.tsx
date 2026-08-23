import { type JSX, useCallback, useEffect, useRef, useState } from 'react';

import { getVoiceLanguage, isAppLanguage } from '@/lib/language';
import { playPictogramAudio } from '@/lib/platform/audio';
import {
  extensionForMime,
  isRecordingSupported,
  MAX_RECORDING_MS,
  type Recording,
  startRecording,
} from '@/lib/platform/recording';
import {
  GenerateVoiceError,
  MAX_LABEL_LENGTH,
  useGenerateVoice,
} from '@/lib/queries/generateVoice';
import { useClearPictogramAudio, useSetPictogramAudio } from '@/lib/queries/pictograms';
import type { Pictogram } from '@/types/domain';
import { Button } from '@/ui/Button/Button';
import { DialogHeader } from '@/ui/DialogHeader/DialogHeader';
import { CheckIcon, MicIcon, PlayIcon, SparkleIcon, StopIcon, TrashIcon } from '@/ui/icons';
import { Modal } from '@/ui/Modal/Modal';
import { PictogramMedia } from '@/widgets/PictoTile/PictogramMedia';

import styles from './VoiceRecorderDialog.module.css';

interface Props {
  picto: Pictogram;
  onClose: () => void;
}

type Mode = 'idle' | 'starting' | 'recording' | 'generating' | 'uploading' | 'playing';

/** A generated clip held for preview. Nothing is saved until the parent accepts. */
interface GeneratedPreview {
  blob: Blob;
  url: string;
}

const TITLE_ID = 'tal-voice-recorder-title';

export const VoiceRecorderDialog = ({ picto, onClose }: Props): JSX.Element => {
  const [mode, setMode] = useState<Mode>('idle');
  const [rec, setRec] = useState<Recording | null>(null);
  const [preview, setPreview] = useState<GeneratedPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saveMut = useSetPictogramAudio();
  const clearMut = useClearPictogramAudio();
  const genMut = useGenerateVoice();
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

  // The playing element for the current preview, so Listen taps replace the
  // clip instead of layering voices, and discard can stop it.
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // A blob URL created for a dropped setPreview never reaches the cleanup
  // effect below. The setup body must re-assert true, or StrictMode's
  // setup → cleanup → setup leaves the guard permanently closed (#433).
  const openRef = useRef(true);
  useEffect(() => {
    openRef.current = true;
    return () => {
      openRef.current = false;
    };
  }, []);

  // The preview's playback and blob URL must not outlive the preview (or
  // the dialog) — revoking a URL out from under a playing clip included.
  useEffect(() => {
    return () => {
      if (!preview) return;
      previewAudioRef.current?.pause();
      previewAudioRef.current = null;
      URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

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
      });
      setMode('idle');
    } catch {
      setMode('idle');
      setError('Upload failed. Check your connection and try again.');
    }
  }, [rec, saveAudio, picto.id]);

  // The recorder stops itself at MAX_RECORDING_MS either way. Without this
  // timer the dialog keeps showing "Recording…" over a stopped recorder, and a
  // later Stop saves a clip the user thinks is longer than it is (#416).
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
      await clearMut.mutateAsync({ pictogramId: picto.id });
    } catch {
      setError('Could not remove recording.');
    }
  };

  const generate = async (): Promise<void> => {
    setError(null);
    // The one generation failure predictable without a round trip.
    if (picto.label.length > MAX_LABEL_LENGTH) {
      setError('This label is too long for voice generation.');
      return;
    }
    setMode('generating');
    try {
      // getVoiceLanguage, not getAppLanguage: the voice should match what
      // the TTS fallback would speak, not the language of parent-UI copy.
      // Clamped to the function's closed set — for a locale we have no
      // neural voice for, English is the least-wrong default.
      const voiceLang = getVoiceLanguage();
      const blob = await genMut.mutateAsync({
        label: picto.label,
        language: isAppLanguage(voiceLang) ? voiceLang : 'en',
      });
      if (!openRef.current) return;
      // The state swap revokes the previous preview's URL via the effect above.
      setPreview({ blob, url: URL.createObjectURL(blob) });
    } catch (err) {
      // Only a request that never got a response blames the connection;
      // a server-side failure told to "check your connection" sends the
      // parent chasing wifi that is fine.
      setError(
        err instanceof GenerateVoiceError && err.code !== 'network'
          ? 'Voice generation failed. Try again in a moment.'
          : 'Could not generate a voice. Check your connection and try again.',
      );
    } finally {
      setMode('idle');
    }
  };

  const playPreview = (): void => {
    if (!preview) return;
    setError(null);
    previewAudioRef.current?.pause();
    const audio = new Audio(preview.url);
    previewAudioRef.current = audio;
    audio.play().catch(() => {
      setError('Could not play the preview.');
    });
  };

  const savePreview = async (): Promise<void> => {
    if (!preview) return;
    setMode('uploading');
    try {
      await saveAudio({
        pictogramId: picto.id,
        blob: preview.blob,
        // From the blob's MIME type, not a literal: the provider MIME type
        // is the one piece of provider knowledge the seam propagates.
        extension: extensionForMime(preview.blob.type),
      });
      setPreview(null);
      setMode('idle');
    } catch {
      setMode('idle');
      setError('Upload failed. Check your connection and try again.');
    }
  };

  const discardPreview = (): void => {
    setPreview(null);
  };

  const busy =
    mode === 'starting' ||
    mode === 'generating' ||
    mode === 'uploading' ||
    mode === 'playing' ||
    clearMut.isPending;

  return (
    <Modal onClose={onClose} labelledBy={TITLE_ID} size="md">
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
          ) : mode === 'generating' ? (
            <span className={styles.empty} aria-live="polite">
              Generating a voice…
            </span>
          ) : preview ? (
            <span className={styles.ok} aria-live="polite">
              Voice ready — listen, then save or discard.
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
        {preview ? (
          // A generated clip is waiting. Nothing else until the parent
          // decides — saving and re-recording over an unheard preview are
          // both mistakes this layout makes impossible.
          <>
            <div className={styles.footerLeft}>
              <Button variant="ghost" onClick={playPreview} disabled={busy}>
                <PlayIcon size={12} /> Listen
              </Button>
            </div>
            <div className={styles.footerRight}>
              <Button variant="ghost" onClick={discardPreview} disabled={busy}>
                <TrashIcon size={14} /> Discard
              </Button>
              <Button variant="primary" onClick={savePreview} disabled={busy}>
                <CheckIcon size={14} /> Save voice
              </Button>
            </div>
          </>
        ) : (
          <>
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
                <>
                  <Button variant="ghost" onClick={generate} disabled={busy}>
                    <SparkleIcon size={14} /> Generate voice
                  </Button>
                  <Button variant="primary" onClick={start} disabled={!supported || busy}>
                    <MicIcon size={14} /> {hasAudio ? 'Re-record' : 'Record'}
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </footer>
    </Modal>
  );
};
