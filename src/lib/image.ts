const OUTPUT_SIZE = 512;
const OUTPUT_MIME = 'image/jpeg';
const OUTPUT_QUALITY = 0.88;

export interface ProcessedImage {
  blob: Blob;
  extension: 'jpg';
  previewUrl: string;
}

const loadBitmap = async (file: File): Promise<ImageBitmap | HTMLImageElement> => {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('could not decode image'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
};

const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas toBlob failed'))),
      OUTPUT_MIME,
      OUTPUT_QUALITY,
    );
  });

/**
 * Decode the file, center-crop the largest square, downscale to OUTPUT_SIZE,
 * and re-encode as JPEG. Runs entirely client-side.
 */
export const cropToSquareJpeg = async (file: File): Promise<ProcessedImage> => {
  const bitmap = await loadBitmap(file);
  const w = bitmap instanceof HTMLImageElement ? bitmap.naturalWidth : bitmap.width;
  const h = bitmap instanceof HTMLImageElement ? bitmap.naturalHeight : bitmap.height;
  const side = Math.min(w, h);
  const sx = Math.floor((w - side) / 2);
  const sy = Math.floor((h - side) / 2);

  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas unavailable');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  if ('close' in bitmap) bitmap.close();

  const blob = await canvasToBlob(canvas);
  return { blob, extension: 'jpg', previewUrl: URL.createObjectURL(blob) };
};

export const slugifyLabel = (label: string): string => {
  const base = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'photo';
};
