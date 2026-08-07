import { set } from 'idb-keyval';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createSignedUrlMock = vi.fn<
  (
    path: string,
    expiresIn: number,
  ) => Promise<{
    data: { signedUrl: string } | null;
    error: Error | null;
  }>
>();

const fromMock = vi.fn((_bucket: string) => ({
  createSignedUrl: createSignedUrlMock,
}));

const captureExceptionMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: (bucket: string) => fromMock(bucket) } },
}));

vi.mock('@/lib/platform/telemetry', () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}));

const { mintStoragePath, signedUrlFor } = await import('./storage');

// idb-keyval and the in-process memCache are wiped by the global afterEach in
// vitest.setup.ts (#144) — only the per-test mock counter needs resetting here.
beforeEach(() => {
  createSignedUrlMock.mockReset();
  captureExceptionMock.mockReset();
});

describe('mintStoragePath (#415)', () => {
  it('scopes the path to the owner and pictogram and keeps the extension', () => {
    const path = mintStoragePath('owner-1', 'picto-1', 'webm');
    expect(path).toMatch(/^owner-1\/picto-1-[0-9A-HJKMNP-TV-Z]{26}\.webm$/);
  });

  it('never mints the same path twice', () => {
    // The uniqueness is the point: a late remove or upload from an abandoned
    // outbox run must land on a path no newer write owns.
    const a = mintStoragePath('o', 'p', 'jpg');
    const b = mintStoragePath('o', 'p', 'jpg');
    expect(a).not.toBe(b);
  });
});

describe('signedUrlFor', () => {
  it('mints once and reuses the URL for the in-process lifetime', async () => {
    createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: 'https://example.test/signed?token=abc' },
      error: null,
    });
    const a = await signedUrlFor('pictogram-images', 'a/test.jpg');
    const b = await signedUrlFor('pictogram-images', 'a/test.jpg');
    expect(a).toBe(b);
    expect(createSignedUrlMock).toHaveBeenCalledTimes(1);
  });

  it('survives an in-process cache reset by reading IDB', async () => {
    createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: 'https://example.test/signed?token=abc' },
      error: null,
    });
    await signedUrlFor('pictogram-images', 'a/test.jpg');
    // Simulate a fresh page boot: drop the in-memory map by re-importing.
    vi.resetModules();
    const { signedUrlFor: signedUrlForFresh } = await import('./storage');
    const recovered = await signedUrlForFresh('pictogram-images', 'a/test.jpg');
    expect(recovered).toBe('https://example.test/signed?token=abc');
    expect(createSignedUrlMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the persisted URL when minting fails (offline)', async () => {
    // A past expiresAt forces the mint path, and the mint then rejects, so the
    // stale entry must be reached for rather than thrown past.
    await set('signed-url:pictogram-images/a/test.jpg', {
      url: 'https://example.test/old?token=old',
      expiresAt: Date.now() - 1000,
    });
    vi.resetModules();
    createSignedUrlMock.mockRejectedValueOnce(new Error('offline'));
    const { signedUrlFor: signedUrlForFresh } = await import('./storage');
    const recovered = await signedUrlForFresh('pictogram-images', 'a/test.jpg');
    expect(recovered).toBe('https://example.test/old?token=old');
  });

  // The stale-URL fallback must not swallow the error: without the report a
  // persistent mint failure is invisible (#142).
  it('captures a warning when minting fails, even if a fallback is returned (#142)', async () => {
    await set('signed-url:pictogram-images/a/test.jpg', {
      url: 'https://example.test/old?token=old',
      expiresAt: Date.now() - 1000,
    });
    vi.resetModules();
    const mintError = new Error('offline');
    createSignedUrlMock.mockRejectedValueOnce(mintError);
    const { signedUrlFor: signedUrlForFresh } = await import('./storage');
    await signedUrlForFresh('pictogram-images', 'a/test.jpg');
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    const [err, ctx] = captureExceptionMock.mock.calls[0] as [
      unknown,
      { level?: string; tags?: Record<string, string> },
    ];
    expect(err).toBe(mintError);
    expect(ctx.level).toBe('warning');
    expect(ctx.tags).toMatchObject({ component: 'storage', op: 'signedUrlFor' });
  });
});
