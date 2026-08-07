/**
 * `speak()` reads these at call time, so a settings change lands on the next
 * tap. A null `voiceURI` means the `pickVoice()` heuristic; a URI that no
 * longer resolves falls back to it silently.
 */

const STORAGE_KEY = 'talrum:speech-prefs';

export interface SpeechPrefs {
  rate: number;
  pitch: number;
  voiceURI: string | null;
}

export const SPEECH_PREFS_DEFAULTS: SpeechPrefs = {
  rate: 0.95,
  pitch: 1.05,
  voiceURI: null,
};

const isSpeechPrefs = (v: unknown): v is SpeechPrefs => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.rate === 'number' &&
    typeof o.pitch === 'number' &&
    (o.voiceURI === null || typeof o.voiceURI === 'string')
  );
};

export const getSpeechPrefs = (): SpeechPrefs => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return SPEECH_PREFS_DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    if (isSpeechPrefs(parsed)) return parsed;
    return SPEECH_PREFS_DEFAULTS;
  } catch {
    return SPEECH_PREFS_DEFAULTS;
  }
};

export const setSpeechPrefs = (prefs: SpeechPrefs): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota / privacy mode errors — feature is best-effort
  }
};

export const clearSpeechPrefs = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};
