import { useCallback, useEffect, useState } from 'react';

import { MAX_RECORDING_MS, type Recording, startRecording } from '@/lib/platform/recording';

type RecordingStatus = 'idle' | 'starting' | 'recording' | 'stopping';

interface VoiceRecording {
  status: RecordingStatus;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

/** `report` and `save` must be stable: they feed `stop`, and a new `stop` resets the cap timer. */
export const useVoiceRecording = (
  save: (blob: Blob) => Promise<boolean>,
  report: (message: string | null) => void,
): VoiceRecording => {
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [rec, setRec] = useState<Recording | null>(null);

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
    setStatus('stopping');
    const blob = await rec.stop().catch(() => null);
    setRec(null);
    setStatus('idle');
    if (blob) await save(blob);
    else report('Recording failed. Try again.');
  }, [rec, save, report]);

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
