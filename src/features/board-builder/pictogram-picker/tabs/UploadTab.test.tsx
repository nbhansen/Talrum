import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Pictogram } from '@/types/domain';

const usePictogramsMock = vi.fn<() => { data: Pictogram[] | undefined }>();
const useCreatePhotoMock = vi.fn(() => ({
  mutateAsync: vi.fn().mockResolvedValue({ id: 'p', imagePath: 'o/p.jpg' }),
  isPending: false,
}));

vi.mock('@/lib/queries/pictograms', () => ({
  usePictograms: () => usePictogramsMock(),
  useCreatePhotoPictogram: () => useCreatePhotoMock(),
}));

vi.mock('@/lib/useSignedUrl', () => ({
  useSignedUrl: () => null,
}));

vi.mock('@/lib/image', () => ({
  cropToSquareJpeg: vi.fn(),
}));

const { UploadTab } = await import('./UploadTab');

const mkPhoto = (id: string, label: string, imagePath?: string): Pictogram =>
  ({
    id,
    label,
    style: 'photo',
    ...(imagePath ? { imagePath } : {}),
  }) as Pictogram;

beforeEach(() => {
  usePictogramsMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('UploadTab · YOUR UPLOADS section', () => {
  it('hides the section entirely when only stock + null-image photos exist', () => {
    usePictogramsMock.mockReturnValue({
      data: [
        mkPhoto('p1', 'Park', 'stock:park'),
        mkPhoto('p2', 'Store', 'stock:store'),
        mkPhoto('p3', 'Empty'), // null imagePath
      ],
    });
    render(<UploadTab />);
    expect(screen.queryByText(/your uploads/i)).toBeNull();
  });

  it('shows only photos the user has actually uploaded', () => {
    usePictogramsMock.mockReturnValue({
      data: [
        mkPhoto('p1', 'Park', 'stock:park'),
        mkPhoto('p2', 'My cereal', 'owner-id/p2.jpg'),
        mkPhoto('p3', 'My shoes', 'owner-id/p3.jpg'),
      ],
    });
    render(<UploadTab />);
    expect(screen.getByText(/your uploads/i)).toBeInTheDocument();
    expect(screen.getByText('My cereal')).toBeInTheDocument();
    expect(screen.getByText('My shoes')).toBeInTheDocument();
    expect(screen.queryByText('Park')).toBeNull();
  });
});
