import { type JSX, useEffect, useState } from 'react';

import { getAvailableVoices, isSpeechSupported, speak, subscribeVoices } from '@/lib/speech';
import {
  clearSpeechPrefs,
  getSpeechPrefs,
  setSpeechPrefs,
  SPEECH_PREFS_DEFAULTS,
  type SpeechPrefs,
} from '@/lib/speechPrefs';

import styles from './SpeechPrefsSection.module.css';

interface VoiceOption {
  uri: string;
  label: string;
}

const toVoiceOptions = (voices: readonly SpeechSynthesisVoice[]): VoiceOption[] => {
  const sorted = [...voices].sort((a, b) => {
    const aEn = a.lang.startsWith('en') ? 0 : 1;
    const bEn = b.lang.startsWith('en') ? 0 : 1;
    if (aEn !== bEn) return aEn - bEn;
    return a.name.localeCompare(b.name);
  });
  return sorted.map((v) => ({ uri: v.voiceURI, label: `${v.name} (${v.lang})` }));
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

  const onVoice = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const value = e.target.value;
    update({ ...prefs, voiceURI: value === '' ? null : value });
  };

  const onRate = (e: React.ChangeEvent<HTMLInputElement>): void => {
    update({ ...prefs, rate: Number(e.target.value) });
  };

  const onPitch = (e: React.ChangeEvent<HTMLInputElement>): void => {
    update({ ...prefs, pitch: Number(e.target.value) });
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
        <label htmlFor="speech-voice" className={styles.label}>
          Voice
        </label>
        <select
          id="speech-voice"
          className={styles.select}
          value={prefs.voiceURI ?? ''}
          onChange={onVoice}
        >
          <option value="">Default (auto-pick)</option>
          {voices.map((v) => (
            <option key={v.uri} value={v.uri}>
              {v.label}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.row}>
        <label htmlFor="speech-rate" className={styles.label}>
          Rate
        </label>
        <input
          id="speech-rate"
          type="range"
          min={0.5}
          max={1.5}
          step={0.05}
          value={prefs.rate}
          onChange={onRate}
          className={styles.slider}
        />
        <span className={styles.value}>{prefs.rate.toFixed(2)}</span>
      </div>
      <div className={styles.row}>
        <label htmlFor="speech-pitch" className={styles.label}>
          Pitch
        </label>
        <input
          id="speech-pitch"
          type="range"
          min={0.5}
          max={1.5}
          step={0.05}
          value={prefs.pitch}
          onChange={onPitch}
          className={styles.slider}
        />
        <span className={styles.value}>{prefs.pitch.toFixed(2)}</span>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.button}
          onClick={() => speak('Hello, this is a test.')}
        >
          Test voice
        </button>
        <button type="button" className={styles.linkButton} onClick={onReset}>
          Reset to defaults
        </button>
      </div>
    </section>
  );
};
