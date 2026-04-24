import { describe, expect, it } from 'vitest';

import type { Pictogram } from '@/types/domain';
import type { Database } from '@/types/supabase';

import { pictogramToInsert, rowToPictogram } from './pictograms';

type Row = Database['public']['Tables']['pictograms']['Row'];

const illusRow = (): Row => ({
  id: 'wakeup',
  owner_id: 'owner-uuid',
  label: 'Wake up',
  style: 'illus',
  glyph: 'sun',
  tint: 'oklch(90% 0.06 90)',
  image_path: null,
  audio_path: null,
  created_at: '2026-04-24T00:00:00Z',
});

const photoRow = (overrides: Partial<Row> = {}): Row => ({
  id: 'park',
  owner_id: 'owner-uuid',
  label: 'Park',
  style: 'photo',
  glyph: null,
  tint: null,
  image_path: null,
  audio_path: null,
  created_at: '2026-04-24T00:00:00Z',
  ...overrides,
});

describe('rowToPictogram', () => {
  it('maps an illustrated row to a discriminated IllustratedPictogram', () => {
    const p = rowToPictogram(illusRow());
    expect(p).toEqual({
      id: 'wakeup',
      label: 'Wake up',
      style: 'illus',
      glyph: 'sun',
      tint: 'oklch(90% 0.06 90)',
    });
  });

  it('omits audioPath when the DB column is null', () => {
    const p = rowToPictogram(illusRow());
    expect('audioPath' in p).toBe(false);
  });

  it('includes audioPath when present', () => {
    const p = rowToPictogram({ ...illusRow(), audio_path: 'storage/key.mp3' });
    expect(p.audioPath).toBe('storage/key.mp3');
  });

  it('maps a photo row to a PhotoPictogram, preserving imagePath', () => {
    const p = rowToPictogram(photoRow({ image_path: 'photos/park.jpg' }));
    expect(p).toEqual({
      id: 'park',
      label: 'Park',
      style: 'photo',
      imagePath: 'photos/park.jpg',
    });
  });
});

describe('pictogramToInsert round-trip', () => {
  it('illus → insert → row → domain preserves shape', () => {
    const original: Pictogram = {
      id: 'bed',
      label: 'Out of bed',
      style: 'illus',
      glyph: 'bed',
      tint: 'oklch(88% 0.05 300)',
    };
    const insert = pictogramToInsert(original, 'owner-uuid');
    const row: Row = {
      ...insert,
      audio_path: insert.audio_path ?? null,
      image_path: insert.image_path ?? null,
      glyph: insert.glyph ?? null,
      tint: insert.tint ?? null,
      created_at: '2026-04-24T00:00:00Z',
    };
    expect(rowToPictogram(row)).toEqual(original);
  });
});
