import type { JSX } from 'react';

import { kindUnit } from '@/lib/boardKindVocab';
import type { BoardKind, VoiceMode } from '@/types/domain';
import { Segmented } from '@/ui/Segmented/Segmented';
import { Select } from '@/ui/Select/Select';
import { Toggle } from '@/ui/Toggle/Toggle';

import styles from './SettingsRow.module.css';

interface SettingsRowProps {
  kind: BoardKind;
  onKindChange: (next: BoardKind) => void;
  labelsVisible: boolean;
  onLabelsChange: (next: boolean) => void;
  voiceMode: VoiceMode;
  onVoiceModeChange: (next: VoiceMode) => void;
  kidReorderable: boolean;
  onKidReorderableChange: (next: boolean) => void;
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
  kidReorderable,
  onKidReorderableChange,
  stepCount,
}: SettingsRowProps): JSX.Element => (
  <div className={styles.row}>
    <Segmented value={kind} onChange={onKindChange} options={KIND_OPTIONS} />
    <Toggle label="Labels" value={labelsVisible} onChange={onLabelsChange} />
    {kind === 'sequence' && (
      <Toggle label="Kid can reorder" value={kidReorderable} onChange={onKidReorderableChange} />
    )}
    <Select label="Voice" value={voiceMode} onChange={onVoiceModeChange} options={VOICE_OPTIONS} />
    <div className={styles.spacer} />
    <div className={styles.count}>
      {stepCount} {kindUnit(kind, stepCount)} · drag to reorder
    </div>
  </div>
);
