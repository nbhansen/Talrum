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

/**
 * Hard cap on one recording (#416). Pictogram audio is a spoken label, so
 * ten seconds is generous. The cap also keeps every clip far inside the
 * outbox blob timeout (`BLOB_HANDLER_TIMEOUT_MS`, `src/lib/outbox/
 * handlers.ts`) on any usable uplink: that bound is wall-clock and a retry
 * restarts from byte zero, so an uncapped clip could grow past what the
 * bound lets sync. Change the two together.
 */
export const MAX_RECORDING_MS = 10_000;

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
  let tornDown = false;
  const teardown = (): void => {
    if (tornDown) return;
    tornDown = true;
    stream.getTracks().forEach((t) => t.stop());
  };
  // Registered before start so the blob is captured whichever path stops
  // the recorder — the caller's stop(), the duration cap, or cancel().
  const blobReady = new Promise<Blob>((resolve) => {
    rec.addEventListener(
      'stop',
      () => {
        teardown();
        resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
      },
      { once: true },
    );
  });
  rec.start();
  // Enforced here, not only in the dialog UI, so no consumer of this
  // wrapper can produce a clip the outbox blob timeout cannot sync.
  const capTimer = setTimeout(() => {
    if (rec.state !== 'inactive') rec.stop();
  }, MAX_RECORDING_MS);
  return {
    stop: (): Promise<Blob> => {
      clearTimeout(capTimer);
      if (rec.state !== 'inactive') rec.stop();
      return blobReady;
    },
    cancel: (): void => {
      clearTimeout(capTimer);
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
