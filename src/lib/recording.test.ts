import { describe, expect, it } from 'vitest';

import { extensionForMime } from './recording';

describe('extensionForMime', () => {
  it('returns webm for Chromium mime types', () => {
    expect(extensionForMime('audio/webm')).toBe('webm');
    expect(extensionForMime('audio/webm;codecs=opus')).toBe('webm');
  });

  it('returns m4a for Safari mp4', () => {
    expect(extensionForMime('audio/mp4')).toBe('m4a');
  });

  it('returns ogg for ogg containers', () => {
    expect(extensionForMime('audio/ogg;codecs=opus')).toBe('ogg');
  });

  it('falls back to webm for unknown mime types', () => {
    expect(extensionForMime('')).toBe('webm');
    expect(extensionForMime('audio/wav')).toBe('webm');
  });
});
