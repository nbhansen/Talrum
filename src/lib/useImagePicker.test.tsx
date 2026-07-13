import { act, renderHook } from '@testing-library/react';
import type { ChangeEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cropToSquareJpeg, type ProcessedImage } from './image';
import { useImagePicker } from './useImagePicker';

vi.mock('./image', () => ({
  cropToSquareJpeg: vi.fn(),
}));

const cropMock = vi.mocked(cropToSquareJpeg);
const revokeMock = vi.fn();

const processedFor = (url: string): ProcessedImage => ({
  blob: new Blob(['x'], { type: 'image/jpeg' }),
  previewUrl: url,
  extension: 'jpg',
});

const changeEventFor = (file: File | null): ChangeEvent<HTMLInputElement> =>
  ({
    target: { files: file ? [file] : [], value: 'C:\\fakepath\\x.jpg' },
  }) as unknown as ChangeEvent<HTMLInputElement>;

const pick = async (
  result: { current: ReturnType<typeof useImagePicker> },
  name = 'photo.jpg',
): Promise<void> => {
  await act(async () => {
    result.current.onInputChange(changeEventFor(new File(['x'], name, { type: 'image/jpeg' })));
  });
};

beforeEach(() => {
  cropMock.mockReset();
  revokeMock.mockReset();
  URL.revokeObjectURL = revokeMock;
});

describe('useImagePicker', () => {
  it('processes a picked file and exposes the result', async () => {
    cropMock.mockResolvedValue(processedFor('blob:1'));
    const { result } = renderHook(() => useImagePicker());

    await pick(result, 'cereal.jpg');

    expect(result.current.processed?.previewUrl).toBe('blob:1');
    expect(result.current.fileName).toBe('cereal.jpg');
    expect(result.current.processing).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('revokes the previous preview URL when a new file is picked', async () => {
    cropMock.mockResolvedValueOnce(processedFor('blob:1'));
    cropMock.mockResolvedValueOnce(processedFor('blob:2'));
    const { result } = renderHook(() => useImagePicker());

    await pick(result);
    await pick(result);

    expect(revokeMock).toHaveBeenCalledWith('blob:1');
    expect(result.current.processed?.previewUrl).toBe('blob:2');
  });

  it('revokes the preview URL on unmount', async () => {
    cropMock.mockResolvedValue(processedFor('blob:1'));
    const { result, unmount } = renderHook(() => useImagePicker());

    await pick(result);
    unmount();

    expect(revokeMock).toHaveBeenCalledWith('blob:1');
  });

  it('revokes the preview URL on reset and clears state', async () => {
    cropMock.mockResolvedValue(processedFor('blob:1'));
    const { result } = renderHook(() => useImagePicker());

    await pick(result);
    act(() => {
      result.current.reset();
    });

    expect(revokeMock).toHaveBeenCalledWith('blob:1');
    expect(result.current.processed).toBeNull();
    expect(result.current.fileName).toBeNull();
  });

  it('reports an unreadable image and keeps no stale pick', async () => {
    cropMock.mockRejectedValue(new Error('bad image'));
    const { result } = renderHook(() => useImagePicker());

    await pick(result, 'broken.png');

    expect(result.current.error).toBe('Could not read that image. Try a JPG or PNG.');
    expect(result.current.processed).toBeNull();
    expect(result.current.fileName).toBeNull();
    expect(result.current.processing).toBe(false);
  });
});
