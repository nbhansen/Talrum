import { useCallback, useEffect, useState } from 'react';

import {
  extensionForMime,
  MAX_RECORDING_MS,
  type Recording,
  startRecording,
} from '@/lib/platform/recording';
import { useSetPictogramAudio } from '@/lib/queries/pictograms';

type RecordingStatus = 'idle' | 'starting' | 'recording' | 'uploading';

interface VoiceRecording {
  status: RecordingStatus;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

/** `report` must be stable: it feeds `stop`, and a new `stop` resets the cap timer. */
export const useVoiceRecording = (
  pictogramId: string,
  report: (message: string | null) => void,
): VoiceRecording => {
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [rec, setRec] = useState<Recording | null>(null);
  // mutateAsync is referentially stable, unlike the mutation object.
  const { mutateAsync: saveAudio } = useSetPictogramAudio();

  useEffect(() => {
    return () => {
      rec?.cancel();
    };
  }, [rec]);

  const start = async (): Promise<void> => {
    report(null);
    setStatus('starting');
    try {
      const r = await startRecording();
      setRec(r);
      setStatus('recording');
    } catch {
      setStatus('idle');
      report('Microphone unavailable. Grant permission and retry.');
    }
  };

  const stop = useCallback(async (): Promise<void> => {
    if (!rec) return;
    setStatus('uploading');
    try {
      const blob = await rec.stop();
      setRec(null);
      await saveAudio({ pictogramId, blob, extension: extensionForMime(blob.type) });
      setStatus('idle');
    } catch {
      setStatus('idle');
      report('Upload failed. Check your connection and try again.');
    }
  }, [rec, saveAudio, pictogramId, report]);

  // The recorder stops itself at MAX_RECORDING_MS either way. Without this
  // timer the dialog keeps showing "Recording…" over a stopped recorder, and a
  // later Stop saves a clip the user thinks is longer than it is (#416).
  useEffect(() => {
    if (status !== 'recording') return undefined;
    const timer = setTimeout(() => {
      void stop();
    }, MAX_RECORDING_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [status, stop]);

  return { status, start, stop };
};
