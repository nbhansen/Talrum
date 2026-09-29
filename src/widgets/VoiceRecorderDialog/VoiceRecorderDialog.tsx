import { type JSX, useState } from 'react';

import { playPictogramAudio } from '@/lib/platform/audio';
import { isRecordingSupported, MAX_RECORDING_MS } from '@/lib/platform/recording';
import { useClearPictogramAudio } from '@/lib/queries/pictograms';
import { voiceModeLabel } from '@/lib/voiceModeVocab';
import type { Pictogram } from '@/types/domain';
import { Button } from '@/ui/Button/Button';
import { DialogHeader } from '@/ui/DialogHeader/DialogHeader';
import { FormError } from '@/ui/FormError/FormError';
import { CheckIcon, MicIcon, PlayIcon, SparkleIcon, StopIcon, TrashIcon } from '@/ui/icons';
import { Modal } from '@/ui/Modal/Modal';
import { PictogramMedia } from '@/widgets/PictoTile/PictogramMedia';

import { useGeneratedVoicePreview } from './useGeneratedVoicePreview';
import { useVoiceRecording } from './useVoiceRecording';
import styles from './VoiceRecorderDialog.module.css';

interface Props {
  picto: Pictogram;
  onClose: () => void;
}

const TITLE_ID = 'tal-voice-recorder-title';

export const VoiceRecorderDialog = ({ picto, onClose }: Props): JSX.Element => {
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const recording = useVoiceRecording(picto.id, setError);
  const generated = useGeneratedVoicePreview(picto, setError);
  const clearMut = useClearPictogramAudio();
  const supported = isRecordingSupported();
  const hasAudio = Boolean(picto.audioPath);
  const isRecording = recording.status === 'recording';
  const { preview } = generated;

  const play = async (): Promise<void> => {
    if (!picto.audioPath) return;
    setError(null);
    setPlaying(true);
    try {
      await playPictogramAudio(picto.audioPath);
    } catch {
      setError('Could not play recording.');
    } finally {
      setPlaying(false);
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

  const busy =
    recording.status === 'starting' ||
    recording.status === 'uploading' ||
    generated.status !== 'idle' ||
    playing ||
    clearMut.isPending;

  return (
    <Modal onClose={onClose} labelledBy={TITLE_ID} size="md">
      <div className={styles.headerWrap}>
        <DialogHeader
          title="Record voice"
          subtitle={
            <>
              This voice plays for <strong>{picto.label}</strong>, except on a board set to &ldquo;
              {voiceModeLabel('tts')}&rdquo; or &ldquo;{voiceModeLabel('none')}&rdquo;.
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
          {isRecording ? (
            <span className={styles.recDot} aria-live="polite">
              Recording… Stops after {MAX_RECORDING_MS / 1000} seconds.
            </span>
          ) : generated.status === 'generating' ? (
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
        {error && <FormError>{error}</FormError>}
        {!supported && (
          <FormError>
            Your browser can&apos;t record audio. Try Chrome or Safari on the iPad.
          </FormError>
        )}
      </div>
      <footer className={styles.footer}>
        {preview ? (
          // A generated clip is waiting. Nothing else until the parent
          // decides — saving and re-recording over an unheard preview are
          // both mistakes this layout makes impossible.
          <>
            <div className={styles.footerLeft}>
              <Button variant="ghost" onClick={generated.listen} disabled={busy}>
                <PlayIcon size={12} /> Listen
              </Button>
            </div>
            <div className={styles.footerRight}>
              <Button variant="ghost" onClick={generated.discard} disabled={busy}>
                <TrashIcon size={14} /> Discard
              </Button>
              <Button variant="primary" onClick={generated.save} disabled={busy}>
                <CheckIcon size={14} /> Save voice
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className={styles.footerLeft}>
              {hasAudio && !isRecording && (
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
              {isRecording ? (
                <Button variant="primary" onClick={recording.stop}>
                  <StopIcon size={14} /> Stop
                </Button>
              ) : (
                <>
                  <Button variant="ghost" onClick={generated.generate} disabled={busy}>
                    <SparkleIcon size={14} /> Generate voice
                  </Button>
                  <Button variant="primary" onClick={recording.start} disabled={!supported || busy}>
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
