import { getAppLanguage, primarySubtag } from '@/lib/language';
import { getSpeechPrefs } from '@/lib/speechPrefs';

const getSynth = (): SpeechSynthesis | null =>
  'speechSynthesis' in window ? window.speechSynthesis : null;

/**
 * Default-voice heuristic: prefer the chosen app language (#304), then
 * English (the app's own copy), then anything.
 */
const pickVoice = (
  voices: readonly SpeechSynthesisVoice[],
  targetLang: string,
): SpeechSynthesisVoice | null => {
  if (voices.length === 0) return null;
  const matchesTarget = voices.filter((v) => primarySubtag(v.lang) === targetLang);
  const english = voices.filter((v) => primarySubtag(v.lang) === 'en');
  const pool = matchesTarget.length > 0 ? matchesTarget : english.length > 0 ? english : voices;
  // Samantha/Karen/Victoria are Apple's built-in voice names — iPad is the
  // design target device. On other platforms this misses and pool[0] wins.
  return pool.find((v) => /female|samantha|karen|victoria/i.test(v.name)) ?? pool[0] ?? null;
};

/**
 * A saved `voiceURI` overrides the heuristic. The list is read on each call:
 * it is empty on the first Chromium call and fills in later.
 */
const resolveVoice = (
  synth: SpeechSynthesis,
  voiceURI: string | null,
): SpeechSynthesisVoice | null => {
  const voices = synth.getVoices();
  return (
    voices.find((v) => voiceURI !== null && v.voiceURI === voiceURI) ??
    pickVoice(voices, getAppLanguage())
  );
};

export const isSpeechSupported = (): boolean => getSynth() !== null;

export const getAvailableVoices = (): readonly SpeechSynthesisVoice[] => {
  const synth = getSynth();
  return synth ? synth.getVoices() : [];
};

const noop = (): void => undefined;

/**
 * Subscribe to voice-list updates. Browsers populate the voice list async on
 * first access, so the settings UI needs to re-read after
 * the `voiceschanged` event fires. Returns an unsubscribe function.
 */
export const subscribeVoices = (cb: () => void): (() => void) => {
  const synth = getSynth();
  if (!synth) return noop;
  synth.addEventListener('voiceschanged', cb);
  return () => synth.removeEventListener('voiceschanged', cb);
};

export const speak = (text: string): void => {
  const synth = getSynth();
  if (!synth || !text.trim()) return;
  const prefs = getSpeechPrefs();
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  const voice = resolveVoice(synth, prefs.voiceURI);
  if (voice) utter.voice = voice;
  utter.rate = prefs.rate;
  utter.pitch = prefs.pitch;
  synth.speak(utter);
};
