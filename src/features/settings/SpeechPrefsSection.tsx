import { type JSX, useEffect, useState } from 'react';

import { getVoiceLanguage, primarySubtag } from '@/lib/language';
import {
  getAvailableVoices,
  isSpeechSupported,
  speak,
  subscribeVoices,
} from '@/lib/platform/speech';
import {
  clearSpeechPrefs,
  getSpeechPrefs,
  setSpeechPrefs,
  SPEECH_PREFS_DEFAULTS,
  type SpeechPrefs,
} from '@/lib/speechPrefs';
import { Button } from '@/ui/Button/Button';
import { Select } from '@/ui/Select/Select';
import { Slider } from '@/ui/Slider/Slider';

import styles from './SpeechPrefsSection.module.css';

interface VoiceOption {
  value: string;
  label: string;
}

const toVoiceOptions = (voices: readonly SpeechSynthesisVoice[]): VoiceOption[] => {
  // Likely-wanted voices first: the target language (chosen app language,
  // else device locale — #304), then English, then the rest.
  const target = getVoiceLanguage();
  const rank = (lang: string): number =>
    primarySubtag(lang) === target ? 0 : primarySubtag(lang) === 'en' ? 1 : 2;
  const sorted = [...voices].sort((a, b) => {
    const byRank = rank(a.lang) - rank(b.lang);
    if (byRank !== 0) return byRank;
    return a.name.localeCompare(b.name);
  });
  return sorted.map((v) => ({ value: v.voiceURI, label: `${v.name} (${v.lang})` }));
};

export const SpeechPrefsSection = (): JSX.Element => {
  const supported = isSpeechSupported();
  const [prefs, setPrefs] = useState<SpeechPrefs>(() => getSpeechPrefs());
  const [voices, setVoices] = useState<VoiceOption[]>(() => toVoiceOptions(getAvailableVoices()));

  useEffect(() => {
    if (!supported) return;
    const update = (): void => setVoices(toVoiceOptions(getAvailableVoices()));
    // Some browsers populate the voice list async — re-read on voiceschanged.
    return subscribeVoices(update);
  }, [supported]);

  const update = (next: SpeechPrefs): void => {
    setPrefs(next);
    setSpeechPrefs(next);
  };

  const onVoice = (value: string): void => {
    update({ ...prefs, voiceURI: value === '' ? null : value });
  };

  const onReset = (): void => {
    clearSpeechPrefs();
    setPrefs(SPEECH_PREFS_DEFAULTS);
  };

  if (!supported) {
    return (
      <section>
        <h2>Speech</h2>
        <p className={styles.muted}>Your browser doesn't support text-to-speech.</p>
      </section>
    );
  }

  return (
    <section>
      <h2>Speech</h2>
      <p className={styles.muted}>
        How pictograms sound when tapped. Changes apply on the next tap.
      </p>
      <div className={styles.row}>
        <Select
          label="Voice"
          layout="row"
          value={prefs.voiceURI ?? ''}
          onChange={onVoice}
          options={[{ value: '', label: 'Default (auto-pick)' }, ...voices]}
        />
      </div>
      <div className={styles.row}>
        <Slider
          label="Rate"
          value={prefs.rate}
          min={0.5}
          max={1.5}
          step={0.05}
          onChange={(rate) => update({ ...prefs, rate })}
        />
      </div>
      <div className={styles.row}>
        <Slider
          label="Pitch"
          value={prefs.pitch}
          min={0.5}
          max={1.5}
          step={0.05}
          onChange={(pitch) => update({ ...prefs, pitch })}
        />
      </div>
      <div className={styles.actions}>
        <Button variant="ghost" onClick={() => speak('Hello, this is a test.')}>
          Test voice
        </Button>
        <Button variant="ghost" onClick={onReset}>
          Reset to defaults
        </Button>
      </div>
    </section>
  );
};
