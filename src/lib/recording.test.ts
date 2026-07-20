import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { extensionForMime, isRecordingSupported, startRecording } from './recording';

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

/**
 * Spec-faithful MediaRecorder stand-in (jsdom has none): `stop()` delivers the
 * final `dataavailable` before the `stop` event, both asynchronously, exactly
 * as real recorders do — the wrapper's chunk collection and stop-resolution
 * depend on that ordering.
 */
class FakeMediaRecorder extends EventTarget {
  static supportedTypes: string[] = [];
  static instances: FakeMediaRecorder[] = [];

  static isTypeSupported(type: string): boolean {
    return FakeMediaRecorder.supportedTypes.includes(type);
  }

  state: 'inactive' | 'recording' = 'inactive';
  mimeType: string;
  /** Chunks the fake will deliver as `dataavailable` events on stop. */
  pendingChunks: Blob[] = [];
  readonly stopSpy = vi.fn();

  constructor(
    public stream: MediaStream,
    options?: { mimeType?: string },
  ) {
    super();
    this.mimeType = options?.mimeType ?? '';
    FakeMediaRecorder.instances.push(this);
  }

  start(): void {
    this.state = 'recording';
  }

  stop(): void {
    this.stopSpy();
    this.state = 'inactive';
    queueMicrotask(() => {
      for (const chunk of this.pendingChunks) {
        const event = new Event('dataavailable') as Event & { data: Blob };
        event.data = chunk;
        this.dispatchEvent(event);
      }
      this.dispatchEvent(new Event('stop'));
    });
  }
}

const makeTrack = (): { stop: Mock<() => void> } => ({ stop: vi.fn<() => void>() });

const makeStream = (tracks: { stop: () => void }[]): MediaStream =>
  ({ getTracks: () => tracks }) as unknown as MediaStream;

const getUserMediaMock = vi.fn<(c: MediaStreamConstraints) => Promise<MediaStream>>();

const lastRecorder = (): FakeMediaRecorder => {
  const rec = FakeMediaRecorder.instances.at(-1);
  if (!rec) throw new Error('no recorder constructed');
  return rec;
};

describe('startRecording', () => {
  beforeEach(() => {
    FakeMediaRecorder.supportedTypes = [];
    FakeMediaRecorder.instances = [];
    getUserMediaMock.mockReset();
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: getUserMediaMock },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    // @ts-expect-error -- jsdom's navigator has no mediaDevices; remove ours.
    delete navigator.mediaDevices;
  });

  it('requests an audio stream and records with the first browser-supported mime type', async () => {
    getUserMediaMock.mockResolvedValue(makeStream([makeTrack()]));
    // Safari-like browser: no webm, mp4 yes — must pick mp4, not the ogg
    // that also happens to be supported further down the candidate list.
    FakeMediaRecorder.supportedTypes = ['audio/mp4', 'audio/ogg;codecs=opus'];

    await startRecording();

    expect(getUserMediaMock).toHaveBeenCalledWith({ audio: true });
    expect(lastRecorder().mimeType).toBe('audio/mp4');
    expect(lastRecorder().state).toBe('recording');
  });

  it('falls back to the browser default when no candidate mime type is supported', async () => {
    getUserMediaMock.mockResolvedValue(makeStream([makeTrack()]));

    const recording = await startRecording();
    lastRecorder().pendingChunks = [new Blob(['x'])];
    const blob = await recording.stop();

    expect(lastRecorder().mimeType).toBe('');
    // No recorder mimeType → the wrapper labels the blob audio/webm.
    expect(blob.type).toBe('audio/webm');
  });

  it('propagates a getUserMedia rejection (permission denied) without constructing a recorder', async () => {
    getUserMediaMock.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));

    await expect(startRecording()).rejects.toThrow('denied');
    expect(FakeMediaRecorder.instances).toHaveLength(0);
  });

  it('stop() resolves with every captured chunk and releases the mic tracks', async () => {
    const tracks = [makeTrack(), makeTrack()];
    getUserMediaMock.mockResolvedValue(makeStream(tracks));
    FakeMediaRecorder.supportedTypes = ['audio/webm;codecs=opus'];

    const recording = await startRecording();
    lastRecorder().pendingChunks = [new Blob(['ab']), new Blob(['c'])];
    const blob = await recording.stop();

    expect(await blob.text()).toBe('abc');
    expect(blob.type).toBe('audio/webm;codecs=opus');
    for (const track of tracks) expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it('cancel() during recording stops the recorder and releases the mic tracks', async () => {
    const track = makeTrack();
    getUserMediaMock.mockResolvedValue(makeStream([track]));

    const recording = await startRecording();
    recording.cancel();

    expect(lastRecorder().stopSpy).toHaveBeenCalledTimes(1);
    expect(lastRecorder().state).toBe('inactive');
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it('cancel() after stop() still releases tracks without stopping an inactive recorder again', async () => {
    const track = makeTrack();
    getUserMediaMock.mockResolvedValue(makeStream([track]));

    const recording = await startRecording();
    await recording.stop();
    recording.cancel();

    // One stop() from the user, none from cancel — an inactive MediaRecorder
    // throws InvalidStateError on stop() in real browsers.
    expect(lastRecorder().stopSpy).toHaveBeenCalledTimes(1);
  });
});

describe('isRecordingSupported', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    // @ts-expect-error -- jsdom's navigator has no mediaDevices; remove ours.
    delete navigator.mediaDevices;
  });

  it('is true when both getUserMedia and MediaRecorder exist', () => {
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: getUserMediaMock },
      configurable: true,
    });
    expect(isRecordingSupported()).toBe(true);
  });

  it('is false without MediaRecorder', () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: getUserMediaMock },
      configurable: true,
    });
    expect(isRecordingSupported()).toBe(false);
  });

  it('is false without mediaDevices', () => {
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    expect(isRecordingSupported()).toBe(false);
  });
});
