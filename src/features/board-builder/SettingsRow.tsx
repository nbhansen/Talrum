import type { JSX } from 'react';

import type { BoardKind, VoiceMode } from '@/types/domain';
import { Segmented } from '@/ui/Segmented/Segmented';
import { Select } from '@/ui/Select/Select';
import { Toggle } from '@/ui/Toggle/Toggle';

interface SettingsRowProps {
  kind: BoardKind;
  onKindChange: (next: BoardKind) => void;
  labelsVisible: boolean;
  onLabelsChange: (next: boolean) => void;
  voiceMode: VoiceMode;
  onVoiceModeChange: (next: VoiceMode) => void;
  stepCount: number;
}

const KIND_OPTIONS = [
  { value: 'sequence' as const, label: 'Sequence', sub: 'Do this, then this, then this' },
  { value: 'choice' as const, label: 'Choice', sub: 'This or that or that?' },
];

const VOICE_OPTIONS = [
  { value: 'tts' as const, label: 'Read aloud (TTS)' },
  { value: 'parent' as const, label: "Mom's voice (recorded)" },
  { value: 'none' as const, label: 'No sound' },
];

export const SettingsRow = ({
  kind,
  onKindChange,
  labelsVisible,
  onLabelsChange,
  voiceMode,
  onVoiceModeChange,
  stepCount,
}: SettingsRowProps): JSX.Element => (
  <div
    style={{
      display: 'flex',
      gap: 10,
      flexWrap: 'wrap',
      marginTop: 12,
      marginBottom: 28,
    }}
  >
    <Segmented value={kind} onChange={onKindChange} options={KIND_OPTIONS} />
    <Toggle label="Labels" value={labelsVisible} onChange={onLabelsChange} />
    <Select label="Voice" value={voiceMode} onChange={onVoiceModeChange} options={VOICE_OPTIONS} />
    <div style={{ flex: 1 }} />
    <div
      style={{
        alignSelf: 'center',
        fontSize: 13,
        color: 'var(--tal-ink-muted)',
        fontWeight: 600,
      }}
    >
      {stepCount} step{stepCount === 1 ? '' : 's'} · drag to reorder
    </div>
  </div>
);
