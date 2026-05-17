import type { AccentBg } from '@/theme/tokens';

/**
 * A CSS color expression used for pictogram tile backgrounds. Unlike the
 * semantic accent tokens, these are raw OKLCH strings because the seed
 * library uses a slightly softer lightness (88%) than the full accents
 * and a handful of custom hues (e.g. red-ish for apple).
 */
export type PictogramTint = string;

export type GlyphName =
  | 'apple'
  | 'bag'
  | 'bath'
  | 'bed'
  | 'book'
  | 'bowl'
  | 'brush'
  | 'car'
  | 'check'
  | 'cup'
  | 'heart'
  | 'park'
  | 'play'
  | 'shirt'
  | 'shoe'
  | 'store'
  | 'sun'
  | 'swing'
  | 'tooth'
  | 'zoo';

interface IllustratedPictogram {
  id: string;
  /** Stable text slug present on seed-cloned rows; absent for user uploads. */
  slug?: string;
  label: string;
  style: 'illus';
  glyph: GlyphName;
  tint: PictogramTint;
  audioPath?: string;
}

interface PhotoPictogram {
  id: string;
  slug?: string;
  label: string;
  style: 'photo';
  /** Storage key or inline blob URL. Undefined in Phase 1 for seed data. */
  imagePath?: string;
  audioPath?: string;
}

export type Pictogram = IllustratedPictogram | PhotoPictogram;

export type BoardKind = 'sequence' | 'choice';

export type VoiceMode = 'tts' | 'parent' | 'none';

export interface Board {
  id: string;
  slug?: string;
  ownerId: string;
  kidId: string;
  name: string;
  kind: BoardKind;
  labelsVisible: boolean;
  voiceMode: VoiceMode;
  /**
   * Pictogram ids in display order. Resolved against the pictogram catalog
   * at render time — the board doesn't own the pictogram data.
   */
  stepIds: string[];
  /**
   * When true, KidSequence lets the kid drag tiles to reorder. Caregiver-
   * controlled; off by default because not every kid benefits from the
   * extra interaction surface.
   */
  kidReorderable: boolean;
  accent: AccentBg;
  updatedLabel: string;
}

export interface Kid {
  id: string;
  ownerId: string;
  name: string;
}
