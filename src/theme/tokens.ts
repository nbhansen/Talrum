/**
 * Typed names for the custom properties in tokens.css. Prefer CSS Module
 * classes; `cssVar()` is for the rare runtime value that must go inline.
 */

export type ColorToken =
  | 'bg'
  | 'surface'
  | 'surface-alt'
  | 'line'
  | 'line-soft'
  | 'ink'
  | 'ink-soft'
  | 'ink-muted'
  | 'sage'
  | 'sage-ink'
  | 'sky'
  | 'sky-ink'
  | 'peach'
  | 'peach-ink'
  | 'lavender'
  | 'lavender-ink'
  | 'sun'
  | 'sun-ink'
  | 'glyph-stroke'
  | 'glyph-fill'
  | 'photo-stripe-a'
  | 'photo-stripe-b'
  | 'on-accent'
  | 'overlay'
  | 'danger'
  | 'fatal-bg'
  | 'fatal-ink'
  | 'brand-sky'
  | 'brand-mark';

export const cssVar = (token: ColorToken): string => `var(--tal-${token})`;

const ACCENTS = ['sage', 'sky', 'peach', 'lavender', 'sun'] as const;

/** Narrower than ColorToken so a non-accent token cannot reach an accent slot. */
export type AccentBg = (typeof ACCENTS)[number];

export const accentForIndex = (i: number): AccentBg => ACCENTS[i % ACCENTS.length] ?? 'sage';

export const inkForAccent = (bg: AccentBg): ColorToken => `${bg}-ink`;
