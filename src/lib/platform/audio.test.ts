import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

vi.mock('@/lib/storage', () => ({
  AUDIO_BUCKET: 'pictogram-audio',
  signedUrlFor: vi.fn(),
}));

const play = vi.fn<() => Promise<void>>();
const pause = vi.fn();

class FakeAudio {
  src: string;
  constructor(src: string) {
    this.src = src;
  }
  play = play;
  pause = pause;
}

// src at construction time; playPictogramAudio clears the old element's src.
const createdSrcs: string[] = [];
const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();

let signedUrlFor: Mock;
let playPictogramAudio: (path: string) => Promise<void>;

beforeEach(async () => {
  vi.clearAllMocks();
  createdSrcs.length = 0;
  let n = 0;
  createObjectURL.mockImplementation(() => `blob:mock-${++n}`);
  play.mockResolvedValue(undefined);
  vi.stubGlobal(
    'Audio',
    class extends FakeAudio {
      constructor(src: string) {
        super(src);
        createdSrcs.push(src);
      }
    },
  );
  vi.stubGlobal('fetch', vi.fn());
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
  // Fresh module per test: audio.ts keeps the current clip in module-level
  // state. The reset also recreates the storage mock, so grab the new
  // signedUrlFor instance before importing the module under test.
  vi.resetModules();
  ({ signedUrlFor } = (await import('@/lib/storage')) as unknown as { signedUrlFor: Mock });
  signedUrlFor.mockResolvedValue('https://storage.test/signed?token=t');
  ({ playPictogramAudio } = await import('./audio'));
});

const okResponse = (blob: Blob): Response => ({ ok: true, blob: async () => blob }) as Response;

describe('playPictogramAudio', () => {
  it('fetches the signed URL and plays from a blob object URL', async () => {
    const clip = new Blob(['bytes'], { type: 'audio/webm' });
    vi.mocked(fetch).mockResolvedValue(okResponse(clip));

    await playPictogramAudio('u/a.webm');

    expect(signedUrlFor).toHaveBeenCalledWith('pictogram-audio', 'u/a.webm');
    expect(fetch).toHaveBeenCalledWith('https://storage.test/signed?token=t');
    expect(createObjectURL).toHaveBeenCalledWith(clip);
    expect(createdSrcs).toEqual(['blob:mock-1']);
    expect(play).toHaveBeenCalledOnce();
  });

  it('throws on a non-OK response instead of playing the error body', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 403 } as Response);

    await expect(playPictogramAudio('u/a.webm')).rejects.toThrow('403');
    expect(createdSrcs).toHaveLength(0);
    expect(play).not.toHaveBeenCalled();
  });

  it('propagates a fetch failure so the caller can fall back to TTS', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('offline'));

    await expect(playPictogramAudio('u/a.webm')).rejects.toThrow('offline');
    expect(play).not.toHaveBeenCalled();
  });

  it('stops the previous clip and revokes its object URL on the next play', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse(new Blob(['a'])));
    await playPictogramAudio('u/a.webm');
    await playPictogramAudio('u/b.webm');

    expect(pause).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:mock-1');
    expect(createdSrcs).toEqual(['blob:mock-1', 'blob:mock-2']);
  });
});
