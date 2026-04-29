import { describe, expect, it, vi } from 'vitest';

const createSignedUrlMock = vi.fn<
  (
    path: string,
    expiresIn: number,
  ) => Promise<{
    data: { signedUrl: string } | null;
    error: Error | null;
  }>
>();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({ createSignedUrl: createSignedUrlMock }),
    },
  },
}));

const { signedUrlFor } = await import('./storage');

describe('signedUrlFor cross-test isolation', () => {
  it('first test populates the cache', async () => {
    createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: 'https://example.test/first' },
      error: null,
    });
    const url = await signedUrlFor('pictogram-images', 'pollution/probe.jpg');
    expect(url).toBe('https://example.test/first');
    expect(createSignedUrlMock).toHaveBeenCalledTimes(1);
  });

  it('second test must re-mint a fresh URL — no carryover from prior test', async () => {
    createSignedUrlMock.mockReset();
    createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: 'https://example.test/second' },
      error: null,
    });
    const url = await signedUrlFor('pictogram-images', 'pollution/probe.jpg');
    expect(createSignedUrlMock).toHaveBeenCalledTimes(1);
    expect(url).toBe('https://example.test/second');
  });
});
