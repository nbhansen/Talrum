import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetSpeechForTests, getAvailableVoices, isSpeechSupported, speak } from './speech';
import { setSpeechPrefs } from './speechPrefs';

interface FakeVoice {
  name: string;
  lang: string;
  voiceURI?: string;
}

const makeFakeSynth = (voices: FakeVoice[]) => {
  const utters: SpeechSynthesisUtterance[] = [];
  const cancel = vi.fn();
  const speakFn = vi.fn((u: SpeechSynthesisUtterance) => utters.push(u));
  return {
    synth: {
      cancel,
      speak: speakFn,
      getVoices: () => voices as unknown as SpeechSynthesisVoice[],
      addEventListener: vi.fn(),
    },
    utters,
    cancel,
    speakFn,
  };
};

const originalSynth = (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
const originalUtter = (globalThis as { SpeechSynthesisUtterance?: unknown })
  .SpeechSynthesisUtterance;

class StubUtterance {
  text: string;
  voice: SpeechSynthesisVoice | null = null;
  rate = 1;
  pitch = 1;
  constructor(text: string) {
    this.text = text;
  }
}

beforeEach(() => {
  (globalThis as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = StubUtterance;
  window.localStorage.removeItem('talrum:speech-prefs');
  __resetSpeechForTests();
});

afterEach(() => {
  if (originalSynth)
    (globalThis as { speechSynthesis: SpeechSynthesis }).speechSynthesis = originalSynth;
  else delete (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
  (globalThis as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = originalUtter;
});

describe('speak()', () => {
  it('cancels in-flight speech and speaks the requested text', () => {
    const { synth, utters, cancel, speakFn } = makeFakeSynth([{ name: 'Samantha', lang: 'en-US' }]);
    (globalThis as { speechSynthesis: unknown }).speechSynthesis = synth;

    speak('hello');

    expect(cancel).toHaveBeenCalledOnce();
    expect(speakFn).toHaveBeenCalledOnce();
    expect(utters[0]?.text).toBe('hello');
    expect(utters[0]?.voice?.name).toBe('Samantha');
  });

  it('is a no-op for blank text', () => {
    const { synth, speakFn } = makeFakeSynth([{ name: 'Alex', lang: 'en' }]);
    (globalThis as { speechSynthesis: unknown }).speechSynthesis = synth;

    speak('   ');

    expect(speakFn).not.toHaveBeenCalled();
  });

  it('is a no-op when the platform has no speechSynthesis', () => {
    delete (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
    expect(() => speak('hello')).not.toThrow();
    expect(isSpeechSupported()).toBe(false);
  });

  it('prefers an English voice when multiple languages are available', () => {
    const { synth, utters } = makeFakeSynth([
      { name: 'Xander', lang: 'nl-NL' },
      { name: 'Karen', lang: 'en-AU' },
    ]);
    (globalThis as { speechSynthesis: unknown }).speechSynthesis = synth;

    speak('apple');

    expect(utters[0]?.voice?.name).toBe('Karen');
  });

  it('honors stored rate and pitch from speechPrefs', () => {
    const { synth, utters } = makeFakeSynth([{ name: 'Samantha', lang: 'en-US' }]);
    (globalThis as { speechSynthesis: unknown }).speechSynthesis = synth;
    setSpeechPrefs({ rate: 1.4, pitch: 0.7, voiceURI: null });

    speak('hello');

    expect(utters[0]?.rate).toBe(1.4);
    expect(utters[0]?.pitch).toBe(0.7);
  });

  it('uses the saved voiceURI when it matches an available voice', () => {
    const voices = [
      { name: 'Samantha', lang: 'en-US', voiceURI: 'urn:samantha' },
      { name: 'Daniel', lang: 'en-GB', voiceURI: 'urn:daniel' },
    ];
    const { synth, utters } = makeFakeSynth(voices);
    (globalThis as { speechSynthesis: unknown }).speechSynthesis = synth;
    setSpeechPrefs({ rate: 1, pitch: 1, voiceURI: 'urn:daniel' });

    speak('hello');

    expect(utters[0]?.voice?.name).toBe('Daniel');
  });

  it('falls back to the heuristic when the saved voiceURI is no longer present', () => {
    const { synth, utters } = makeFakeSynth([
      { name: 'Samantha', lang: 'en-US', voiceURI: 'urn:samantha' },
    ]);
    (globalThis as { speechSynthesis: unknown }).speechSynthesis = synth;
    setSpeechPrefs({ rate: 1, pitch: 1, voiceURI: 'urn:gone' });

    speak('hello');

    expect(utters[0]?.voice?.name).toBe('Samantha');
  });
});

describe('getAvailableVoices()', () => {
  it('returns the platform voice list', () => {
    const { synth } = makeFakeSynth([{ name: 'Samantha', lang: 'en-US' }]);
    (globalThis as { speechSynthesis: unknown }).speechSynthesis = synth;
    expect(getAvailableVoices().map((v) => v.name)).toEqual(['Samantha']);
  });

  it('returns empty when speechSynthesis is unsupported', () => {
    delete (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
    expect(getAvailableVoices()).toEqual([]);
  });
});
