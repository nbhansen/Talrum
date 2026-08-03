import { AUDIO_BUCKET, signedUrlFor } from '@/lib/storage';

let current: HTMLAudioElement | null = null;
let currentObjectUrl: string | null = null;

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
  const url = await signedUrlFor(AUDIO_BUCKET, path);
  // Stop the previous clip before any fallible IO: if the fetch below throws,
  // speakPictogram falls back to TTS, and a still-playing clip would talk
  // over it.
  if (current) {
    current.pause();
    current.src = '';
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`audio fetch failed with status ${res.status}`);
  const blob = await res.blob();
  // Revoke the previous clip's object URL, or every tap leaks one blob.
  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = URL.createObjectURL(blob);
  const audio = new Audio(currentObjectUrl);
  current = audio;
  await audio.play();
};
