import { describe, expect, it } from 'vitest';

import { kidCopy } from './kidCopy';

describe('kidCopy', () => {
  it('interpolates the picked label into the confirm CTA', () => {
    expect(kidCopy.choice.letsGoTo('Park')).toBe("Let's go to Park");
  });

  it('interpolates the picked label into the re-speak aria label', () => {
    expect(kidCopy.choice.hearAgain('Park')).toBe('Hear Park again');
  });
});
