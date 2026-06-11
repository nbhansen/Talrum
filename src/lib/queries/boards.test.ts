import { describe, expect, it } from 'vitest';

import type { Database } from '@/types/supabase';

import { rowToBoard } from './boards.read';

type Row = Database['public']['Tables']['boards']['Row'];

const row = (overrides: Partial<Row> = {}): Row => ({
  id: 'morning',
  owner_id: 'owner-uuid',
  kid_id: 'liam',
  slug: null,
  name: 'Morning routine',
  kind: 'sequence',
  labels_visible: true,
  voice_mode: 'tts',
  step_ids: ['wakeup', 'brush', 'dress'],
  kid_reorderable: false,
  accent: 'peach',
  updated_at: new Date().toISOString(),
  ...overrides,
});

describe('rowToBoard', () => {
  it('maps snake_case columns to camelCase domain fields', () => {
    const b = rowToBoard(row());
    expect(b.id).toBe('morning');
    expect(b.ownerId).toBe('owner-uuid');
    expect(b.kidId).toBe('liam');
    expect(b.kind).toBe('sequence');
    expect(b.labelsVisible).toBe(true);
    expect(b.voiceMode).toBe('tts');
    expect(b.stepIds).toEqual(['wakeup', 'brush', 'dress']);
    expect(b.accent).toBe('peach');
  });

  it('derives a human updatedLabel from updated_at', () => {
    const recent = rowToBoard(row({ updated_at: new Date().toISOString() }));
    expect(recent.updatedLabel).toMatch(/just now|m ago/);
  });

  it('exposes the raw updated_at as serverUpdatedAt — the conflict-guard baseline (#281)', () => {
    const b = rowToBoard(row({ updated_at: '2026-06-11T10:00:00.000001+00:00' }));
    expect(b.serverUpdatedAt).toBe('2026-06-11T10:00:00.000001+00:00');
  });

  it('returns a fresh stepIds array (not a Postgres reference)', () => {
    const src = row();
    const b = rowToBoard(src);
    expect(b.stepIds).not.toBe(src.step_ids);
  });
});
