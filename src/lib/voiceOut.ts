import { playPictogramAudio } from '@/lib/platform/audio';
import { speak } from '@/lib/platform/speech';
import { captureException } from '@/lib/platform/telemetry';
import type { Pictogram, VoiceMode } from '@/types/domain';

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
    } catch (err) {
      // Fall through to TTS for the user, but report it: a systematically
      // broken recording (bad codec, 403 path, truncated upload) would
      // otherwise degrade to TTS forever with no signal to anyone (#359).
      captureException(err, { level: 'warning', tags: { component: 'voiceOut' } });
    }
  }
  speak(picto.label);
};
