/**
 * Thin wrapper around the browser's Web Speech API.
 *
 * `speechSynthesis.getVoices()` is async on first call in Chromium — voices
 * arrive via a `voiceschanged` event. We cache a heuristic-picked voice once
 * it's known so each `speak()` isn't a fresh lookup; the cache is keyed on
 * the target language so a settings change applies on the next tap. The
 * user's saved `voiceURI` (from speechPrefs) overrides the heuristic when
 * present.
 */

import { getVoiceLanguage, primarySubtag } from './language';
import { getSpeechPrefs } from './speechPrefs';

let cachedVoice: SpeechSynthesisVoice | null = null;
let cachedVoiceLang: string | null = null;
let listenerAttached = false;

const getSynth = (): SpeechSynthesis | null =>
  typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

/**
 * Default-voice heuristic: prefer the target language (chosen app language,
 * else device locale — a Danish household's iPad should read Danish labels
 * with a Danish voice, #304), then English (the app's own copy), then
 * anything.
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

const ensureVoice = (synth: SpeechSynthesis): void => {
  const targetLang = getVoiceLanguage();
  if (cachedVoice && cachedVoiceLang === targetLang) return;
  const voices = synth.getVoices();
  if (voices.length > 0) {
    cachedVoice = pickVoice(voices, targetLang);
    cachedVoiceLang = targetLang;
    return;
  }
  if (listenerAttached) return;
  listenerAttached = true;
  synth.addEventListener(
    'voiceschanged',
    () => {
      const lang = getVoiceLanguage();
      cachedVoice = pickVoice(synth.getVoices(), lang);
      cachedVoiceLang = lang;
    },
    { once: true },
  );
};

const resolveVoice = (
  synth: SpeechSynthesis,
  voiceURI: string | null,
): SpeechSynthesisVoice | null => {
  if (voiceURI) {
    const match = synth.getVoices().find((v) => v.voiceURI === voiceURI);
    if (match) return match;
  }
  ensureVoice(synth);
  return cachedVoice;
};

export const isSpeechSupported = (): boolean => getSynth() !== null;

export const getAvailableVoices = (): readonly SpeechSynthesisVoice[] => {
  const synth = getSynth();
  return synth ? synth.getVoices() : [];
};

const noop = (): void => undefined;

/**
 * Subscribe to voice-list updates. Browsers populate the voice list async on
 * first access (see `ensureVoice`), so the settings UI needs to re-read after
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

export const __resetSpeechForTests = (): void => {
  cachedVoice = null;
  cachedVoiceLang = null;
  listenerAttached = false;
};
