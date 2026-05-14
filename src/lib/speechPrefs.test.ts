import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearSpeechPrefs,
  getSpeechPrefs,
  setSpeechPrefs,
  SPEECH_PREFS_DEFAULTS,
} from './speechPrefs';

beforeEach(() => {
  window.localStorage.removeItem('talrum:speech-prefs');
});

describe('speechPrefs', () => {
  it('returns defaults when nothing is stored', () => {
    expect(getSpeechPrefs()).toEqual(SPEECH_PREFS_DEFAULTS);
  });

  it('round-trips: set then get', () => {
    setSpeechPrefs({ rate: 1.2, pitch: 0.8, voiceURI: 'urn:moz:voice:1' });
    expect(getSpeechPrefs()).toEqual({ rate: 1.2, pitch: 0.8, voiceURI: 'urn:moz:voice:1' });
  });

  it('clear removes the entry and returns defaults', () => {
    setSpeechPrefs({ rate: 1.2, pitch: 0.8, voiceURI: null });
    clearSpeechPrefs();
    expect(getSpeechPrefs()).toEqual(SPEECH_PREFS_DEFAULTS);
  });

  it('returns defaults when the stored value is malformed JSON', () => {
    window.localStorage.setItem('talrum:speech-prefs', '{not-json');
    expect(getSpeechPrefs()).toEqual(SPEECH_PREFS_DEFAULTS);
  });

  it('returns defaults when the stored value has the wrong shape', () => {
    window.localStorage.setItem('talrum:speech-prefs', JSON.stringify({ rate: 'fast' }));
    expect(getSpeechPrefs()).toEqual(SPEECH_PREFS_DEFAULTS);
  });
});
