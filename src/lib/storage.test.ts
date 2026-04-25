import { clear, set } from 'idb-keyval';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createSignedUrlMock = vi.fn<
  (path: string, expiresIn: number) => Promise<{
    data: { signedUrl: string } | null;
    error: Error | null;
  }>
>();

const fromMock = vi.fn((_bucket: string) => ({
  createSignedUrl: createSignedUrlMock,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: (bucket: string) => fromMock(bucket) } },
}));

const { invalidateSignedUrl, signedUrlFor } = await import('./storage');

beforeEach(async () => {
  await clear();
  createSignedUrlMock.mockReset();
});

afterEach(() => {
  invalidateSignedUrl('pictogram-images', 'a/test.jpg');
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
    // Mint should NOT have happened a second time — the cache hit served it.
    expect(createSignedUrlMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the persisted URL when minting fails (offline)', async () => {
    // Plant a stale entry directly: expiresAt in the past forces the mint path
    // on the next call. The mint then rejects (offline), so the implementation
    // must reach for the stale persisted entry rather than throwing.
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
});
