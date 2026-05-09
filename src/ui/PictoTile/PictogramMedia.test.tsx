import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Pictogram } from '@/types/domain';

const useSignedUrlMock = vi.fn<(bucket: string, path: string | undefined) => string | null>();

vi.mock('@/lib/useSignedUrl', () => ({
  useSignedUrl: (bucket: string, path: string | undefined) => useSignedUrlMock(bucket, path),
}));

const { PictogramMedia } = await import('./PictogramMedia');

const photoPicto = (imagePath: string | undefined): Pictogram => ({
  id: 'p',
  label: 'Park',
  style: 'photo',
  ...(imagePath !== undefined ? { imagePath } : {}),
});

describe('PictogramMedia', () => {
  it('serves bundled stock photos without hitting the signed-URL hook', () => {
    useSignedUrlMock.mockReturnValue(null);
    render(<PictogramMedia picto={photoPicto('stock:park')} size={120} />);
    const img = screen.getByRole('img', { name: 'Park' });
    expect(img).toHaveAttribute('src', '/seed-photos/park.jpg');
    // Hook is still called (Rules of Hooks) but with `undefined` so it short-circuits.
    expect(useSignedUrlMock).toHaveBeenCalledWith(expect.any(String), undefined);
  });

  it('routes user-uploaded photos through the signed-URL hook', () => {
    useSignedUrlMock.mockReturnValue('https://signed.example/park.jpg?token=x');
    render(<PictogramMedia picto={photoPicto('owner-id/path.jpg')} size={120} />);
    expect(useSignedUrlMock).toHaveBeenCalledWith('pictogram-images', 'owner-id/path.jpg');
    expect(screen.getByRole('img', { name: 'Park' })).toHaveAttribute(
      'src',
      'https://signed.example/park.jpg?token=x',
    );
  });

  it('falls back to the placeholder when imagePath is missing', () => {
    useSignedUrlMock.mockReturnValue(null);
    render(<PictogramMedia picto={photoPicto(undefined)} size={120} />);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('falls back to the placeholder for a bare `stock:` (empty slug) sentinel', () => {
    // Only reachable via a malformed DB row; should not request /seed-photos/.jpg.
    useSignedUrlMock.mockReturnValue(null);
    render(<PictogramMedia picto={photoPicto('stock:')} size={120} />);
    expect(screen.queryByRole('img')).toBeNull();
  });
});
