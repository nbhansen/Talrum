import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetSpeechForTests } from '@/lib/speech';
import { getSpeechPrefs } from '@/lib/speechPrefs';

import { SpeechPrefsSection } from './SpeechPrefsSection';

interface FakeVoice {
  name: string;
  lang: string;
  voiceURI: string;
}

const makeFakeSynth = (voices: FakeVoice[]) => {
  const utters: SpeechSynthesisUtterance[] = [];
  return {
    cancel: vi.fn(),
    speak: vi.fn((u: SpeechSynthesisUtterance) => utters.push(u)),
    getVoices: () => voices as unknown as SpeechSynthesisVoice[],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    utters,
  };
};

class StubUtterance {
  text: string;
  voice: SpeechSynthesisVoice | null = null;
  rate = 1;
  pitch = 1;
  constructor(text: string) {
    this.text = text;
  }
}

const originalSynth = (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
const originalUtter = (globalThis as { SpeechSynthesisUtterance?: unknown })
  .SpeechSynthesisUtterance;

beforeEach(() => {
  window.localStorage.removeItem('talrum:speech-prefs');
  __resetSpeechForTests();
  (globalThis as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = StubUtterance;
});

afterEach(() => {
  if (originalSynth)
    (globalThis as { speechSynthesis: SpeechSynthesis }).speechSynthesis = originalSynth;
  else delete (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
  (globalThis as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = originalUtter;
});

describe('SpeechPrefsSection', () => {
  it('renders the unsupported message when speechSynthesis is missing', () => {
    delete (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
    render(<SpeechPrefsSection />);
    expect(screen.getByText(/doesn't support text-to-speech/i)).toBeInTheDocument();
  });

  it('lists all voices with English sorted first', () => {
    (globalThis as { speechSynthesis: unknown }).speechSynthesis = makeFakeSynth([
      { name: 'Xander', lang: 'nl-NL', voiceURI: 'urn:x' },
      { name: 'Samantha', lang: 'en-US', voiceURI: 'urn:s' },
      { name: 'Daniel', lang: 'en-GB', voiceURI: 'urn:d' },
    ]);
    render(<SpeechPrefsSection />);
    const select = screen.getByLabelText(/voice/i) as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels).toEqual([
      'Default (auto-pick)',
      'Daniel (en-GB)',
      'Samantha (en-US)',
      'Xander (nl-NL)',
    ]);
  });

  it('persists voice choice to localStorage', async () => {
    const user = userEvent.setup();
    (globalThis as { speechSynthesis: unknown }).speechSynthesis = makeFakeSynth([
      { name: 'Samantha', lang: 'en-US', voiceURI: 'urn:s' },
      { name: 'Daniel', lang: 'en-GB', voiceURI: 'urn:d' },
    ]);
    render(<SpeechPrefsSection />);

    await user.selectOptions(screen.getByLabelText(/voice/i), 'urn:d');

    expect(getSpeechPrefs().voiceURI).toBe('urn:d');
  });

  it('Test voice button speaks the sample with current prefs', async () => {
    const user = userEvent.setup();
    const synth = makeFakeSynth([{ name: 'Samantha', lang: 'en-US', voiceURI: 'urn:s' }]);
    (globalThis as { speechSynthesis: unknown }).speechSynthesis = synth;
    render(<SpeechPrefsSection />);

    await user.click(screen.getByRole('button', { name: /test voice/i }));

    expect(synth.speak).toHaveBeenCalledOnce();
    expect(synth.utters[0]?.text).toMatch(/Hello/);
  });

  it('Reset to defaults clears stored prefs and resets sliders', async () => {
    const user = userEvent.setup();
    (globalThis as { speechSynthesis: unknown }).speechSynthesis = makeFakeSynth([
      { name: 'Samantha', lang: 'en-US', voiceURI: 'urn:s' },
    ]);
    window.localStorage.setItem(
      'talrum:speech-prefs',
      JSON.stringify({ rate: 1.4, pitch: 0.7, voiceURI: 'urn:s' }),
    );
    render(<SpeechPrefsSection />);

    expect((screen.getByLabelText(/rate/i) as HTMLInputElement).value).toBe('1.4');

    await user.click(screen.getByRole('button', { name: /reset to defaults/i }));

    expect(window.localStorage.getItem('talrum:speech-prefs')).toBeNull();
    expect((screen.getByLabelText(/rate/i) as HTMLInputElement).value).toBe('0.95');
  });
});
