import type { AccentBg } from '@/theme/tokens';

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
  /** Library the row belongs to; absent on an optimistic row (#490). */
  ownerId?: string;
  /** Stable text slug present on seed-cloned rows; absent for user uploads. */
  slug?: string;
  label: string;
  style: 'illus';
  glyph: GlyphName;
  /** Raw OKLCH, not an accent token: the seed library uses softer, custom hues. */
  tint: string;
  audioPath?: string;
}

interface PhotoPictogram {
  id: string;
  ownerId?: string;
  slug?: string;
  label: string;
  style: 'photo';
  /** Storage key, stock sentinel, or an optimistic blob URL. */
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
  /** Resolved against the catalog at render time; the board owns no picto data. */
  stepIds: string[];
  /** Caregiver-controlled, and off by default: not every kid wants the surface. */
  kidReorderable: boolean;
  accent: AccentBg;
  updatedLabel: string;
  /**
   * The conflict-guard baseline (#281). Optional: a board rehydrated from a
   * cache persisted before this existed degrades to last-write-wins.
   */
  serverUpdatedAt?: string;
}

export interface Kid {
  id: string;
  ownerId: string;
  name: string;
}
