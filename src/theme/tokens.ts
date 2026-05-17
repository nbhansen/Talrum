/**
 * Typed token names matching the CSS custom properties in tokens.css.
 *
 * Components should prefer applying classes from CSS Modules that already
 * reference these tokens. `cssVar()` is only for the rare case where a value
 * must land in an inline `style` prop — e.g. a pictogram tile whose
 * background is driven by `picto.tint` at runtime.
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

export type RadiusToken = 'sm' | 'md' | 'lg' | 'xl' | 'pill';

export type ShadowToken = '1' | '2' | '3';

export type SpaceToken = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '10' | '12';

export const cssVar = (token: ColorToken): string => `var(--tal-${token})`;

export const radiusVar = (token: RadiusToken): string => `var(--tal-r-${token})`;

export const shadowVar = (token: ShadowToken): string => `var(--tal-shadow-${token})`;

export const spaceVar = (token: SpaceToken): string => `var(--tal-space-${token})`;

/**
 * The 5 accent backgrounds usable on a Board. Narrower than ColorToken so
 * that callers can't pass non-accent tokens (e.g. `ink`, `photo-stripe-a`)
 * into accent-typed slots, and so `inkForAccent` can be a total function.
 */
export type AccentBg = 'sage' | 'sky' | 'peach' | 'lavender' | 'sun';

export interface Accent {
  bg: AccentBg;
  ink: ColorToken;
}

const ACCENT_CYCLE: readonly Accent[] = [
  { bg: 'sage', ink: 'sage-ink' },
  { bg: 'sky', ink: 'sky-ink' },
  { bg: 'peach', ink: 'peach-ink' },
  { bg: 'lavender', ink: 'lavender-ink' },
  { bg: 'sun', ink: 'sun-ink' },
];

export const accentForIndex = (i: number): Accent => {
  const accent = ACCENT_CYCLE[i % ACCENT_CYCLE.length];
  if (!accent) {
    throw new Error('accentForIndex: empty cycle');
  }
  return accent;
};

/** Total: every AccentBg is present in ACCENT_CYCLE by construction. */
export const inkForAccent = (bg: AccentBg): ColorToken => {
  const accent = ACCENT_CYCLE.find((a) => a.bg === bg);
  if (!accent) {
    throw new Error(`inkForAccent: AccentBg '${bg}' missing from ACCENT_CYCLE`);
  }
  return accent.ink;
};
