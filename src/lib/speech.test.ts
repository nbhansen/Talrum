import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetSpeechForTests, isSpeechSupported, speak } from './speech';

interface FakeVoice {
  name: string;
  lang: string;
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
  __resetSpeechForTests();
});

afterEach(() => {
  if (originalSynth) (globalThis as { speechSynthesis: SpeechSynthesis }).speechSynthesis = originalSynth;
  else delete (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
  (globalThis as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = originalUtter;
});

describe('speak()', () => {
  it('cancels in-flight speech and speaks the requested text', () => {
    const { synth, utters, cancel, speakFn } = makeFakeSynth([
      { name: 'Samantha', lang: 'en-US' },
    ]);
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
});
