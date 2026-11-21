import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Pictogram } from '@/types/domain';

import { pictogramsQueryKey, usePictogramsById, usePictogramsForSlugs } from './pictograms';
import { makeClient, makeWrapper } from './queries.test-utils';

const apple: Pictogram = {
  id: 'apple',
  label: 'Apple',
  style: 'illus',
  glyph: 'apple',
  tint: 'oklch(88% 0.05 20)',
  slug: 'apple',
};
const cup: Pictogram = {
  id: 'cup',
  label: 'Cup',
  style: 'illus',
  glyph: 'cup',
  tint: 'oklch(88% 0.05 240)',
  slug: 'cup',
};

describe('usePictogramsById memoization (#197)', () => {
  it('returns the same Map identity across renders when data is unchanged', () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, [apple, cup]);
    const { result, rerender } = renderHook(() => usePictogramsById(), {
      wrapper: makeWrapper(qc),
    });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('returns a new Map when the underlying data changes', () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, [apple]);
    const { result, rerender } = renderHook(() => usePictogramsById(), {
      wrapper: makeWrapper(qc),
    });
    const first = result.current;
    qc.setQueryData(pictogramsQueryKey, [apple, cup]);
    rerender();
    expect(result.current).not.toBe(first);
    expect(result.current.get('cup')).toEqual(cup);
  });
});

describe('usePictogramsForSlugs', () => {
  const SLUGS = ['cup', 'missing', 'apple'];

  it('returns the pictograms in slug order and drops a missing slug', () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, [apple, cup]);
    const { result } = renderHook(() => usePictogramsForSlugs(SLUGS), {
      wrapper: makeWrapper(qc),
    });
    expect(result.current).toEqual([cup, apple]);
  });

  it('returns the same array identity across renders when data is unchanged (#197)', () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, [apple, cup]);
    const { result, rerender } = renderHook(() => usePictogramsForSlugs(SLUGS), {
      wrapper: makeWrapper(qc),
    });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
