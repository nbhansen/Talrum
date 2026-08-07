import { playPictogramAudio } from '@/lib/platform/audio';
import { speak } from '@/lib/platform/speech';
import type { Pictogram, VoiceMode } from '@/types/domain';

/**
 * A failed recording falls back to TTS quietly, so a tap is never silent.
 */
export const speakPictogram = async (picto: Pictogram, mode: VoiceMode): Promise<void> => {
  if (mode === 'none') return;
  if (mode === 'parent' && picto.audioPath) {
    try {
      await playPictogramAudio(picto.audioPath);
      return;
    } catch {
      // Fall through to TTS. The failure is not silent to us: signing
      // failures report in storage.ts, everything else (403, truncated
      // upload, bad codec, refused play) reports in platform/audio.ts (#359).
    }
  }
  speak(picto.label);
};
