import { captureException } from '@/lib/platform/telemetry';
import { AUDIO_BUCKET, signedUrlFor } from '@/lib/storage';

let current: HTMLAudioElement | null = null;
let currentObjectUrl: string | null = null;
// Generation counter: each tap invalidates every in-flight older call. The
// awaits below span a network round trip, so overlapping taps are real —
// without this, two taps inside one fetch window both play, and the loser
// revokes the winner's object URL mid-playback.
let playToken = 0;
// Persistent play() failures (a refused gesture chain, a codec the device
// cannot decode) do not heal within a session, and a kid screen runs this
// path on every tap. Report each failure kind once per session.
const reportedPlayFailures = new Set<string>();

/**
 * Fetch the clip rather than hand the URL to the media element: an element
 * sends `Range`, Supabase answers 206, and `cache.put` rejects a 206, so the
 * clip could never be cached for offline use (#378). A plain fetch gets a 200,
 * and the blob URL then plays from memory.
 */
export const playPictogramAudio = async (path: string): Promise<void> => {
  const token = ++playToken;
  const url = await signedUrlFor(AUDIO_BUCKET, path);
  if (token !== playToken) return;
  // Stop the previous clip before any fallible IO: if the fetch below throws,
  // speakPictogram falls back to TTS, and a still-playing clip would talk
  // over it.
  if (current) {
    current.pause();
    current.src = '';
  }
  let blob: Blob;
  // fetch()'s offline rejection and a body stream that errors mid-read are
  // both TypeErrors; only the response flag can tell them apart.
  let responseReceived = false;
  try {
    const res = await fetch(url);
    responseReceived = true;
    if (!res.ok) throw new Error(`audio fetch failed with status ${res.status}`);
    blob = await res.blob();
  } catch (err) {
    // A superseded call must not throw: the caller's TTS fallback would
    // speak this pictogram's label over the newer tap's clip.
    if (token !== playToken) return;
    // Report (#359), except a rejection before any response — ordinary life
    // offline, where the TTS fallback is the design. A 403 path or a body that
    // fails mid-read is the systematic breakage that must not stay silent.
    if (responseReceived || !(err instanceof TypeError)) {
      captureException(err, { level: 'warning', tags: { component: 'audio', op: 'fetch' } });
    }
    throw err;
  }
  if (token !== playToken) return;
  // Revoke the previous clip's object URL, or every tap leaks one blob.
  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = URL.createObjectURL(blob);
  const audio = new Audio(currentObjectUrl);
  current = audio;
  try {
    await audio.play();
  } catch (err) {
    // A newer tap pausing this element rejects the pending play() with an
    // AbortError: not a defect, and the throw would TTS this label over the
    // newer clip — same supersession rule as the fetch catch above.
    if (token !== playToken) return;
    // A bad codec (NotSupportedError) or a refused gesture chain
    // (NotAllowedError, #428) degrades to TTS forever if nobody hears
    // about it (#359).
    const kind = err instanceof Error ? err.name : String(err);
    if (!reportedPlayFailures.has(kind)) {
      reportedPlayFailures.add(kind);
      captureException(err, { level: 'warning', tags: { component: 'audio', op: 'play' } });
    }
    throw err;
  }
};
