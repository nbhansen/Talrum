import { describe, expect, it } from 'vitest';

import { hasPgCode } from './hasPgCode';

describe('hasPgCode', () => {
  it('matches a supabase-style error object with the given code', () => {
    expect(hasPgCode({ code: 'PGRST116', message: 'not found' }, 'PGRST116')).toBe(true);
  });

  it('rejects a different code', () => {
    expect(hasPgCode({ code: '23505' }, '42501')).toBe(false);
  });

  it('rejects non-objects, null, and objects without a code', () => {
    expect(hasPgCode('PGRST116', 'PGRST116')).toBe(false);
    expect(hasPgCode(null, 'PGRST116')).toBe(false);
    expect(hasPgCode(new Error('PGRST116'), 'PGRST116')).toBe(false);
    expect(hasPgCode({ message: 'no code' }, 'PGRST116')).toBe(false);
  });
});
