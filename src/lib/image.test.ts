import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cropToSquareJpeg } from './image';

/**
 * jsdom has no 2d canvas rasterizer, so the unit under test here is the crop
 * geometry and the decode/encode plumbing: which source rectangle lands on
 * the canvas, which encoder settings are used, and how each failure mode
 * surfaces. drawImage/toBlob are recorded, not rendered.
 */

interface DrawArgs {
  source: unknown;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

const drawCalls: DrawArgs[] = [];
let toBlobResult: Blob | null = null;
let toBlobArgs: { type: string | undefined; quality: number | undefined } | null = null;
let contextAvailable = true;

const fakeContext = {
  imageSmoothingQuality: 'low',
  drawImage: (
    source: unknown,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ) => {
    drawCalls.push({ source, sx, sy, sw, sh, dx, dy, dw, dh });
  },
};

const jpegBlob = (): Blob => new Blob(['jpeg-bytes'], { type: 'image/jpeg' });

const fakeBitmap = (
  width: number,
  height: number,
): { width: number; height: number; close: ReturnType<typeof vi.fn> } => ({
  width,
  height,
  close: vi.fn(),
});

const someFile = (): File => new File(['png-bytes'], 'photo.png', { type: 'image/png' });

const createObjectURLMock = vi.fn<(o: Blob | File) => string>();
const revokeObjectURLMock = vi.fn<(u: string) => void>();

beforeEach(() => {
  drawCalls.length = 0;
  toBlobResult = jpegBlob();
  toBlobArgs = null;
  contextAvailable = true;
  createObjectURLMock.mockReset().mockReturnValue('blob:out');
  revokeObjectURLMock.mockReset();
  URL.createObjectURL = createObjectURLMock;
  URL.revokeObjectURL = revokeObjectURLMock;

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() =>
    contextAvailable ? (fakeContext as unknown as CanvasRenderingContext2D) : null,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
    type?: string,
    quality?: unknown,
  ) {
    toBlobArgs = { type, quality: quality as number | undefined };
    callback(toBlobResult);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('cropToSquareJpeg via createImageBitmap', () => {
  it('center-crops the largest square from a landscape image into a 512px JPEG', async () => {
    const bitmap = fakeBitmap(800, 600);
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));

    const result = await cropToSquareJpeg(someFile());

    expect(drawCalls).toEqual([
      // 800×600 → square side 600, x-offset (800-600)/2 = 100, no y-offset.
      { source: bitmap, sx: 100, sy: 0, sw: 600, sh: 600, dx: 0, dy: 0, dw: 512, dh: 512 },
    ]);
    expect(toBlobArgs).toEqual({ type: 'image/jpeg', quality: 0.88 });
    expect(result.blob).toBe(toBlobResult);
    expect(result.extension).toBe('jpg');
    expect(result.previewUrl).toBe('blob:out');
    expect(createObjectURLMock).toHaveBeenCalledWith(toBlobResult);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('center-crops vertically for a portrait image, flooring the odd offset', async () => {
    const bitmap = fakeBitmap(400, 1001);
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));

    await cropToSquareJpeg(someFile());

    // 400×1001 → side 400, y-offset floor((1001-400)/2) = 300.
    expect(drawCalls[0]).toMatchObject({ sx: 0, sy: 300, sw: 400, sh: 400 });
  });

  it('rejects when the 2d context is unavailable', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(fakeBitmap(100, 100)));
    contextAvailable = false;

    await expect(cropToSquareJpeg(someFile())).rejects.toThrow('2d canvas unavailable');
  });

  it('rejects when JPEG encoding produces no blob', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(fakeBitmap(100, 100)));
    toBlobResult = null;

    await expect(cropToSquareJpeg(someFile())).rejects.toThrow('canvas toBlob failed');
  });
});

describe('cropToSquareJpeg via <img> fallback (no createImageBitmap)', () => {
  /**
   * A real HTMLImageElement (so the `instanceof` branch reads naturalWidth/
   * naturalHeight) whose src setter is overridden to fire onload/onerror
   * asynchronously instead of hitting jsdom's non-loading pipeline.
   */
  const installFakeImage = ({
    naturalWidth,
    naturalHeight,
    fail = false,
  }: {
    naturalWidth: number;
    naturalHeight: number;
    fail?: boolean;
  }): void => {
    // A function expression (not an arrow — `new Image()` must work) whose
    // constructor-return hands back a real HTMLImageElement.
    const FakeImage = function (): HTMLImageElement {
      const img = document.createElement('img');
      Object.defineProperty(img, 'naturalWidth', { value: naturalWidth });
      Object.defineProperty(img, 'naturalHeight', { value: naturalHeight });
      Object.defineProperty(img, 'src', {
        set: () => {
          queueMicrotask(() => {
            if (fail) img.onerror?.call(img, new Event('error'));
            else img.onload?.call(img, new Event('load'));
          });
        },
      });
      return img;
    };
    vi.stubGlobal('Image', FakeImage);
  };

  beforeEach(() => {
    vi.stubGlobal('createImageBitmap', undefined);
    createObjectURLMock.mockImplementation((o) => (o instanceof File ? 'blob:in' : 'blob:out'));
  });

  it('decodes through an object URL, crops from natural dimensions, and revokes the input URL', async () => {
    installFakeImage({ naturalWidth: 640, naturalHeight: 480 });

    const result = await cropToSquareJpeg(someFile());

    // 640×480 → side 480, x-offset 80. The <img> element carries width 0 in
    // jsdom, so these numbers prove the natural* branch was used.
    expect(drawCalls[0]).toMatchObject({ sx: 80, sy: 0, sw: 480, sh: 480, dw: 512, dh: 512 });
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:in');
    expect(result.previewUrl).toBe('blob:out');
  });

  it('rejects on an undecodable image and still revokes the input object URL', async () => {
    installFakeImage({ naturalWidth: 0, naturalHeight: 0, fail: true });

    await expect(cropToSquareJpeg(someFile())).rejects.toThrow('could not decode image');
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:in');
  });
});
