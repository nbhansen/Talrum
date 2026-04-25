/**
 * Slices src/assets/talrum-logo.png into the PWA icon family.
 *
 * Run with:
 *   npm run icons:gen
 *
 * Emits public/icon-192.png, public/icon-512.png, public/apple-touch-icon.png.
 * Idempotent: re-running overwrites; commit the outputs.
 */

import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = `${root}src/assets/talrum-logo.png`;

const targets: ReadonlyArray<{ size: number; out: string }> = [
  { size: 192, out: `${root}public/icon-192.png` },
  { size: 512, out: `${root}public/icon-512.png` },
  { size: 180, out: `${root}public/apple-touch-icon.png` },
];

await Promise.all(
  targets.map(({ size, out }) =>
    sharp(src)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(out),
  ),
);

console.log(`Wrote ${targets.length} icons under public/.`);
