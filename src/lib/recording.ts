/**
 * MediaRecorder wrapper. Picks the first mime type the browser supports and
 * resolves `stop()` with a Blob containing every captured chunk.
 */

const CANDIDATE_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
] as const;

const pickMimeType = (): string | undefined => {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return CANDIDATE_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
};

export interface Recording {
  stop: () => Promise<Blob>;
  cancel: () => void;
}

export const isRecordingSupported = (): boolean =>
  typeof navigator !== 'undefined' &&
  Boolean(navigator.mediaDevices?.getUserMedia) &&
  typeof MediaRecorder !== 'undefined';

export const startRecording = async (): Promise<Recording> => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = pickMimeType();
  const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  const chunks: Blob[] = [];
  rec.addEventListener('dataavailable', (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  });
  rec.start();
  const teardown = (): void => {
    stream.getTracks().forEach((t) => t.stop());
  };
  return {
    stop: (): Promise<Blob> =>
      new Promise((resolve) => {
        rec.addEventListener(
          'stop',
          () => {
            teardown();
            resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
          },
          { once: true },
        );
        rec.stop();
      }),
    cancel: (): void => {
      if (rec.state !== 'inactive') rec.stop();
      teardown();
    },
  };
};

export const extensionForMime = (mime: string): string => {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mpeg')) return 'mp3';
  return 'webm';
};
