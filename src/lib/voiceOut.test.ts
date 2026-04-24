import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as audio from './audio';
import * as speech from './speech';
import { speakPictogram } from './voiceOut';

vi.mock('./speech', () => ({ speak: vi.fn() }));
vi.mock('./audio', () => ({ playPictogramAudio: vi.fn() }));

const illusPicto = {
  id: 'a',
  label: 'Apple',
  style: 'illus',
  glyph: 'apple',
  tint: 'x',
} as const;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('speakPictogram', () => {
  it('is silent when mode=none', async () => {
    await speakPictogram(illusPicto, 'none');
    expect(speech.speak).not.toHaveBeenCalled();
    expect(audio.playPictogramAudio).not.toHaveBeenCalled();
  });

  it('uses TTS in tts mode', async () => {
    await speakPictogram(illusPicto, 'tts');
    expect(speech.speak).toHaveBeenCalledWith('Apple');
    expect(audio.playPictogramAudio).not.toHaveBeenCalled();
  });

  it('plays parent audio when a recording exists', async () => {
    vi.mocked(audio.playPictogramAudio).mockResolvedValueOnce();
    await speakPictogram({ ...illusPicto, audioPath: 'u/a.webm' }, 'parent');
    expect(audio.playPictogramAudio).toHaveBeenCalledWith('u/a.webm');
    expect(speech.speak).not.toHaveBeenCalled();
  });

  it('falls back to TTS in parent mode when no recording', async () => {
    await speakPictogram(illusPicto, 'parent');
    expect(audio.playPictogramAudio).not.toHaveBeenCalled();
    expect(speech.speak).toHaveBeenCalledWith('Apple');
  });

  it('falls back to TTS when audio playback fails', async () => {
    vi.mocked(audio.playPictogramAudio).mockRejectedValueOnce(new Error('network'));
    await speakPictogram({ ...illusPicto, audioPath: 'u/a.webm' }, 'parent');
    expect(speech.speak).toHaveBeenCalledWith('Apple');
  });
});
