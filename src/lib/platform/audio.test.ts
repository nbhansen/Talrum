import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

vi.mock('@/lib/storage', () => ({
  AUDIO_BUCKET: 'pictogram-audio',
  signedUrlFor: vi.fn(),
}));

vi.mock('@/lib/platform/telemetry', () => ({ captureException: vi.fn() }));

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
let captureException: Mock;
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
  ({ captureException } = (await import('@/lib/platform/telemetry')) as unknown as {
    captureException: Mock;
  });
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
    // A non-OK response is a systematically broken recording — report it (#359).
    expect(captureException).toHaveBeenCalledExactlyOnceWith(expect.any(Error), {
      level: 'warning',
      tags: { component: 'audio', op: 'fetch' },
    });
  });

  it('propagates a fetch failure so the caller can fall back to TTS', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('offline'));

    await expect(playPictogramAudio('u/a.webm')).rejects.toThrow('offline');
    expect(play).not.toHaveBeenCalled();
    // A network-level rejection is normal offline operation, not a defect.
    expect(captureException).not.toHaveBeenCalled();
  });

  it('reports a refused play and propagates it (#359)', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse(new Blob(['a'])));
    const refused = new Error('NotAllowedError');
    play.mockRejectedValueOnce(refused);

    await expect(playPictogramAudio('u/a.webm')).rejects.toThrow('NotAllowedError');
    expect(captureException).toHaveBeenCalledExactlyOnceWith(refused, {
      level: 'warning',
      tags: { component: 'audio', op: 'play' },
    });
  });

  it('stops the previous clip even when the next fetch fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(okResponse(new Blob(['a'])));
    await playPictogramAudio('u/a.webm');

    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('offline'));
    await expect(playPictogramAudio('u/b.webm')).rejects.toThrow('offline');

    // The TTS fallback fires next; the old clip must not talk over it.
    expect(pause).toHaveBeenCalledOnce();
  });

  it('stops the previous clip and revokes its object URL on the next play', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse(new Blob(['a'])));
    await playPictogramAudio('u/a.webm');
    await playPictogramAudio('u/b.webm');

    expect(pause).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:mock-1');
    expect(createdSrcs).toEqual(['blob:mock-1', 'blob:mock-2']);
  });

  it('plays only the newest of two overlapping taps', async () => {
    let resolveA!: (r: Response) => void;
    let resolveB!: (r: Response) => void;
    vi.mocked(fetch)
      .mockImplementationOnce(() => new Promise<Response>((r) => (resolveA = r)))
      .mockImplementationOnce(() => new Promise<Response>((r) => (resolveB = r)));

    const tapA = playPictogramAudio('u/a.webm');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const tapB = playPictogramAudio('u/b.webm');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    resolveA(okResponse(new Blob(['a'])));
    resolveB(okResponse(new Blob(['b'])));
    await Promise.all([tapA, tapB]);

    // Tap A was superseded mid-fetch: it must not create an element, play,
    // or revoke the object URL tap B is playing from.
    expect(createdSrcs).toEqual(['blob:mock-1']);
    expect(play).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it('does not throw from a superseded tap whose fetch fails', async () => {
    let rejectA!: (e: unknown) => void;
    let resolveB!: (r: Response) => void;
    vi.mocked(fetch)
      .mockImplementationOnce(() => new Promise<Response>((_r, rej) => (rejectA = rej)))
      .mockImplementationOnce(() => new Promise<Response>((r) => (resolveB = r)));

    const tapA = playPictogramAudio('u/a.webm');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const tapB = playPictogramAudio('u/b.webm');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    rejectA(new TypeError('offline'));
    resolveB(okResponse(new Blob(['b'])));

    // If tap A threw, its caller would speak A's label over B's clip.
    await expect(tapA).resolves.toBeUndefined();
    await tapB;
    expect(play).toHaveBeenCalledOnce();
    // A superseded failure is moot — it must not report either.
    expect(captureException).not.toHaveBeenCalled();
  });
});
