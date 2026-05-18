/**
 * Slices src/assets/talrum-logo.png into the PWA icon family.
 *
 * Run with:
 *   npm run icons:gen
 *
 * Emits public/icon-192.png, public/icon-512.png, public/apple-touch-icon.png,
 * and public/icon-512-maskable.png (Android adaptive-icon safe-zone variant
 * on the brand background). Idempotent: re-running overwrites; commit the outputs.
 */

import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = `${root}src/assets/talrum-logo.png`;

// Brand bg `--tal-bg` (src/theme/tokens.css) — sRGB hex form of oklch(97.5% 0.008 85).
const BRAND_BG = { r: 0xf9, g: 0xf6, b: 0xf1, alpha: 1 };

const transparent: readonly { size: number; out: string }[] = [
  { size: 192, out: `${root}public/icon-192.png` },
  { size: 512, out: `${root}public/icon-512.png` },
  { size: 180, out: `${root}public/apple-touch-icon.png` },
];

// palette: true quantises to a 256-colour PNG — drops the logo's plain-bg
// 512×512 output from ~232 KB to ~20-40 KB without visible degradation.
const pngOpts = { palette: true, quality: 90, compressionLevel: 9 } as const;

await Promise.all([
  ...transparent.map(({ size, out }) =>
    sharp(src)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png(pngOpts)
      .toFile(out),
  ),
  // Maskable variant: logo at 80% of canvas, centered, on opaque brand bg.
  // The web-manifest maskable safe zone is the inner 80% diameter circle, so
  // the rounded-square logo's corners will clip on circular system masks —
  // that's expected and the whole point of the maskable purpose. The actual
  // content (speaker glyph + wordmark) stays well within the safe circle;
  // only the outer brand-frame corners get cropped.
  sharp(src)
    .resize(410, 410, { fit: 'contain', background: BRAND_BG })
    .extend({ top: 51, bottom: 51, left: 51, right: 51, background: BRAND_BG })
    .flatten({ background: BRAND_BG })
    .png(pngOpts)
    .toFile(`${root}public/icon-512-maskable.png`),
]);

console.log(`Wrote ${transparent.length + 1} icons under public/.`);
