import { type JSX, useState } from 'react';

import { playPictogramAudio } from '@/lib/platform/audio';
import { isRecordingSupported, MAX_RECORDING_MS } from '@/lib/platform/recording';
import { useClearPictogramAudio, usePictograms } from '@/lib/queries/pictograms';
import { voiceModeLabel } from '@/lib/voiceModeVocab';
import type { Pictogram } from '@/types/domain';
import { Button } from '@/ui/Button/Button';
import { DialogHeader } from '@/ui/DialogHeader/DialogHeader';
import { FormError } from '@/ui/FormError/FormError';
import { CheckIcon, MicIcon, PlayIcon, SparkleIcon, StopIcon, TrashIcon } from '@/ui/icons';
import { Modal } from '@/ui/Modal/Modal';
import { PictogramMedia } from '@/widgets/PictoTile/PictogramMedia';

import { useGeneratedVoicePreview } from './useGeneratedVoicePreview';
import { useSaveVoice } from './useSaveVoice';
import { useVoiceRecording } from './useVoiceRecording';
import styles from './VoiceRecorderDialog.module.css';

type DialogMode = 'recording' | 'generating' | 'preview' | 'saved' | 'empty';

interface Props {
  picto: Pictogram;
  onClose: () => void;
}

export const VoiceRecorderDialog = ({ picto: snapshot, onClose }: Props): JSX.Element => {
  // Hosts capture the pictogram at tap time; saved audio lands in the cache.
  const picto = usePictograms().data?.find((p) => p.id === snapshot.id) ?? snapshot;
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const saveVoice = useSaveVoice(picto.id, setError);
  const recording = useVoiceRecording(saveVoice.save, setError);
  const generated = useGeneratedVoicePreview(picto, saveVoice.save, setError);
  const clearMut = useClearPictogramAudio();
  const supported = isRecordingSupported();
  const hasAudio = Boolean(picto.audioPath);
  const mode: DialogMode =
    recording.status === 'recording'
      ? 'recording'
      : generated.status === 'generating'
        ? 'generating'
        : generated.preview
          ? 'preview'
          : hasAudio
            ? 'saved'
            : 'empty';

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
    recording.status === 'stopping' ||
    generated.status !== 'idle' ||
    saveVoice.isPending ||
    playing ||
    clearMut.isPending;

  return (
    <Modal onClose={onClose} size="md">
      <div className={styles.headerWrap}>
        <DialogHeader
          title="Record voice"
          subtitle={
            <>
              This voice plays for <strong>{picto.label}</strong>, except on a board set to &ldquo;
              {voiceModeLabel('tts')}&rdquo; or &ldquo;{voiceModeLabel('none')}&rdquo;.
            </>
          }
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
          ) : mode === 'preview' ? (
            <span className={styles.ok} aria-live="polite">
              Voice ready — listen, then save or discard.
            </span>
          ) : mode === 'saved' ? (
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
        {mode === 'preview' ? (
          // A generated clip is waiting. Nothing else until the parent
          // decides — saving and re-recording over an unheard preview are
          // both mistakes this layout makes impossible.
          <>
            <div className={styles.footerLeft}>
              <Button
                variant="ghost"
                icon={<PlayIcon size={12} />}
                onClick={generated.listen}
                disabled={busy}
              >
                Listen
              </Button>
            </div>
            <div className={styles.footerRight}>
              <Button
                variant="ghost"
                icon={<TrashIcon size={14} />}
                onClick={generated.discard}
                disabled={busy}
              >
                Discard
              </Button>
              <Button
                variant="primary"
                icon={<CheckIcon size={14} />}
                onClick={generated.save}
                disabled={busy}
              >
                Save voice
              </Button>
            </div>
          </>
        ) : mode === 'recording' ? (
          <>
            <div className={styles.footerLeft} />
            <div className={styles.footerRight}>
              <Button variant="primary" icon={<StopIcon size={14} />} onClick={recording.stop}>
                Stop
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className={styles.footerLeft}>
              {hasAudio && (
                <>
                  <Button
                    variant="ghost"
                    icon={<PlayIcon size={12} />}
                    onClick={play}
                    disabled={busy}
                  >
                    Play
                  </Button>
                  <Button
                    variant="ghost"
                    icon={<TrashIcon size={14} />}
                    onClick={del}
                    disabled={busy}
                  >
                    Delete
                  </Button>
                </>
              )}
            </div>
            <div className={styles.footerRight}>
              <Button
                variant="ghost"
                icon={<SparkleIcon size={14} />}
                onClick={generated.generate}
                disabled={busy}
              >
                Generate voice
              </Button>
              <Button
                variant="primary"
                icon={<MicIcon size={14} />}
                onClick={recording.start}
                disabled={!supported || busy}
              >
                {hasAudio ? 'Re-record' : 'Record'}
              </Button>
            </div>
          </>
        )}
      </footer>
    </Modal>
  );
};
