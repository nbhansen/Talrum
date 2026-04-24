/**
 * Thin wrapper around the browser's Web Speech API.
 *
 * `speechSynthesis.getVoices()` is async on first call in Chromium — voices
 * arrive via a `voiceschanged` event. We cache a preferred voice once it's
 * known so each `speak()` isn't a fresh lookup.
 */

let cachedVoice: SpeechSynthesisVoice | null = null;
let listenerAttached = false;

const getSynth = (): SpeechSynthesis | null =>
  typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

const pickVoice = (voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | null => {
  if (voices.length === 0) return null;
  const en = voices.filter((v) => v.lang.startsWith('en'));
  const pool = en.length > 0 ? en : voices;
  return pool.find((v) => /female|samantha|karen|victoria/i.test(v.name)) ?? pool[0] ?? null;
};

const ensureVoice = (synth: SpeechSynthesis): void => {
  if (cachedVoice) return;
  const voices = synth.getVoices();
  if (voices.length > 0) {
    cachedVoice = pickVoice(voices);
    return;
  }
  if (listenerAttached) return;
  listenerAttached = true;
  synth.addEventListener(
    'voiceschanged',
    () => {
      cachedVoice = pickVoice(synth.getVoices());
    },
    { once: true },
  );
};

export const isSpeechSupported = (): boolean => getSynth() !== null;

export const speak = (text: string): void => {
  const synth = getSynth();
  if (!synth || !text.trim()) return;
  ensureVoice(synth);
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  if (cachedVoice) utter.voice = cachedVoice;
  utter.rate = 0.95;
  utter.pitch = 1.05;
  synth.speak(utter);
};

export const __resetSpeechForTests = (): void => {
  cachedVoice = null;
  listenerAttached = false;
};
