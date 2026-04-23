import type { Pictogram } from '@/types/domain';

/**
 * Seed pictogram library. Ported from the prototype's PICTOS dict.
 * In Phase 2 these rows are materialized per-user on first login.
 *
 * Tints use OKLCH at lightness 88% / chroma 0.05 with varying hue — slightly
 * softer than the accent tokens (which sit at 86%). The apple is an outlier
 * at hue 20 (red-ish) because none of the named accents fit a fruit.
 */

const PICTOGRAM_LIST: readonly Pictogram[] = [
  { id: 'wakeup', label: 'Wake up', style: 'illus', glyph: 'sun', tint: 'oklch(90% 0.06 90)' },
  { id: 'bed', label: 'Out of bed', style: 'illus', glyph: 'bed', tint: 'oklch(88% 0.05 300)' },
  {
    id: 'brush',
    label: 'Brush teeth',
    style: 'illus',
    glyph: 'tooth',
    tint: 'oklch(88% 0.05 240)',
  },
  {
    id: 'dress',
    label: 'Get dressed',
    style: 'illus',
    glyph: 'shirt',
    tint: 'oklch(88% 0.05 45)',
  },
  { id: 'shoes', label: 'Shoes on', style: 'illus', glyph: 'shoe', tint: 'oklch(88% 0.05 155)' },
  {
    id: 'breakfast',
    label: 'Breakfast',
    style: 'illus',
    glyph: 'bowl',
    tint: 'oklch(88% 0.05 45)',
  },
  { id: 'apple', label: 'Apple', style: 'illus', glyph: 'apple', tint: 'oklch(88% 0.05 20)' },
  { id: 'cup', label: 'Drink', style: 'illus', glyph: 'cup', tint: 'oklch(88% 0.05 240)' },
  { id: 'bag', label: 'Backpack', style: 'illus', glyph: 'bag', tint: 'oklch(88% 0.05 155)' },
  { id: 'car', label: 'Go to car', style: 'illus', glyph: 'car', tint: 'oklch(88% 0.05 300)' },
  { id: 'park', label: 'Park', style: 'photo' },
  { id: 'store', label: 'Supermarket', style: 'photo' },
  { id: 'zoo', label: 'Zoo', style: 'photo' },
  { id: 'play', label: 'Playground', style: 'photo' },
  {
    id: 'book',
    label: 'Story time',
    style: 'illus',
    glyph: 'book',
    tint: 'oklch(88% 0.05 300)',
  },
  { id: 'bath', label: 'Bath', style: 'illus', glyph: 'bath', tint: 'oklch(88% 0.05 240)' },
  { id: 'heart', label: 'Love', style: 'illus', glyph: 'heart', tint: 'oklch(88% 0.05 20)' },
];

export const PICTOGRAMS: Readonly<Record<string, Pictogram>> = Object.fromEntries(
  PICTOGRAM_LIST.map((p) => [p.id, p]),
);

export const getPictogram = (id: string): Pictogram => {
  const p = PICTOGRAMS[id];
  if (!p) throw new Error(`Unknown pictogram id: ${id}`);
  return p;
};
