import type { Pictogram, VoiceMode } from '@/types/domain';

import { playPictogramAudio } from './audio';
import { speak } from './speech';

/**
 * Single entry point both kid screens use to speak a pictogram.
 *
 * - `none`: silent.
 * - `parent` with a recording: play the recording. On failure (network,
 *   missing object) quietly fall back to TTS so the tap is never silent.
 * - everything else: TTS the label.
 */
export const speakPictogram = async (picto: Pictogram, mode: VoiceMode): Promise<void> => {
  if (mode === 'none') return;
  if (mode === 'parent' && picto.audioPath) {
    try {
      await playPictogramAudio(picto.audioPath);
      return;
    } catch {
      // fall through to TTS
    }
  }
  speak(picto.label);
};
