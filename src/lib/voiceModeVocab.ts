import type { VoiceMode } from '@/types/domain';

const LABELS: Record<VoiceMode, string> = {
  tts: 'Read aloud only (TTS)',
  parent: 'Recorded voice (read aloud if none)',
  none: 'No sound',
};

export const voiceModeLabel = (mode: VoiceMode): string => LABELS[mode];
