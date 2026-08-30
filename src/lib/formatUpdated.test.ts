import { describe, expect, it } from 'vitest';

import { formatUpdated } from './formatUpdated';

const now = new Date('2026-04-24T12:00:00Z');

const ago = (seconds: number): string => new Date(now.getTime() - seconds * 1000).toISOString();

describe('formatUpdated', () => {
  it('labels very recent edits as "just now"', () => {
    expect(formatUpdated(ago(15), now)).toBe('Edited just now');
  });

  it('shows minutes under an hour', () => {
    expect(formatUpdated(ago(60 * 7), now)).toBe('Edited 7m ago');
  });

  it('shows hours under a day', () => {
    expect(formatUpdated(ago(60 * 60 * 3), now)).toBe('Edited 3h ago');
  });

  it('says yesterday for 1 day ago', () => {
    expect(formatUpdated(ago(60 * 60 * 24), now)).toBe('Edited yesterday');
  });

  it('shows days for 2–6 days', () => {
    expect(formatUpdated(ago(60 * 60 * 24 * 3), now)).toBe('Edited 3 days ago');
  });

  it('shows weeks for 1–4 weeks', () => {
    expect(formatUpdated(ago(60 * 60 * 24 * 14), now)).toBe('Edited 2w ago');
  });

  it('does not round 23h up to yesterday', () => {
    expect(formatUpdated(ago(60 * 60 * 23 + 60 * 40), now)).toBe('Edited 23h ago');
  });
});
