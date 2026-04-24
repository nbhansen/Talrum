import { describe, expect, it } from 'vitest';

import type { Database } from '@/types/supabase';

import { rowToBoard } from './boards';

type Row = Database['public']['Tables']['boards']['Row'];

const row = (overrides: Partial<Row> = {}): Row => ({
  id: 'morning',
  owner_id: 'owner-uuid',
  kid_id: 'liam',
  name: 'Morning routine',
  kind: 'sequence',
  labels_visible: true,
  voice_mode: 'tts',
  step_ids: ['wakeup', 'brush', 'dress'],
  kid_reorderable: false,
  accent: 'peach',
  accent_ink: 'peach-ink',
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
    expect(b.accentInk).toBe('peach-ink');
  });

  it('derives a human updatedLabel from updated_at', () => {
    const recent = rowToBoard(row({ updated_at: new Date().toISOString() }));
    expect(recent.updatedLabel).toMatch(/just now|m ago/);
  });

  it('returns a fresh stepIds array (not a Postgres reference)', () => {
    const src = row();
    const b = rowToBoard(src);
    expect(b.stepIds).not.toBe(src.step_ids);
  });
});
