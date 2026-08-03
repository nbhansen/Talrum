import { captureException } from '@/lib/platform/telemetry';
import { AUDIO_BUCKET, signedUrlFor } from '@/lib/storage';

let current: HTMLAudioElement | null = null;
let currentObjectUrl: string | null = null;
// Generation counter: each tap invalidates every in-flight older call. The
// awaits below span a network round trip, so overlapping taps are real —
// without this, two taps inside one fetch window both play, and the loser
// revokes the winner's object URL mid-playback.
let playToken = 0;

/**
 * Fetch the clip ourselves instead of handing the URL to the media element.
 * A media element always sends `Range: bytes=0-`, Supabase answers
 * `206 Partial Content`, and `cache.put` rejects a 206 — so a recording
 * played via `new Audio(url)` can never land in the SW's `talrum-storage-v1`
 * cache (#378). A plain fetch gets a CORS 200 that the CacheFirst storage
 * route stores like any photo; offline, the same fetch is answered from that
 * cache. The blob URL then plays from memory, so the media element's Range
 * request never leaves the page.
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
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`audio fetch failed with status ${res.status}`);
    blob = await res.blob();
  } catch (err) {
    // A superseded call must not throw: the caller's TTS fallback would
    // speak this pictogram's label over the newer tap's clip.
    if (token !== playToken) return;
    // Report (#359) — except a network-level rejection (TypeError), which is
    // ordinary life for an app built to run offline: the TTS fallback is the
    // design there, not a defect. What must not stay silent is a recording
    // that is systematically broken: a 403 path or a truncated body.
    if (!(err instanceof TypeError)) {
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
    // A bad codec (NotSupportedError) or a refused gesture chain
    // (NotAllowedError, #428) degrades to TTS forever if nobody hears
    // about it (#359).
    captureException(err, { level: 'warning', tags: { component: 'audio', op: 'play' } });
    throw err;
  }
};
