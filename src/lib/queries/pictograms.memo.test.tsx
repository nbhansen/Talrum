import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import type { Pictogram } from '@/types/domain';

import { pictogramsQueryKey, usePictogramsById, usePictogramsBySlug } from './pictograms';

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

const wrap = (qc: QueryClient): ((props: { children: ReactNode }) => JSX.Element) => {
  const Wrapped = ({ children }: { children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return Wrapped;
};

describe('usePictogramsById memoization (#197)', () => {
  it('returns the same Map identity across renders when data is unchanged', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(pictogramsQueryKey, [apple, cup]);
    const { result, rerender } = renderHook(() => usePictogramsById(), { wrapper: wrap(qc) });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('returns a new Map when the underlying data changes', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(pictogramsQueryKey, [apple]);
    const { result, rerender } = renderHook(() => usePictogramsById(), { wrapper: wrap(qc) });
    const first = result.current;
    qc.setQueryData(pictogramsQueryKey, [apple, cup]);
    rerender();
    expect(result.current).not.toBe(first);
    expect(result.current.get('cup')).toEqual(cup);
  });
});

describe('usePictogramsBySlug memoization (#197)', () => {
  it('returns the same Map identity across renders when data is unchanged', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(pictogramsQueryKey, [apple, cup]);
    const { result, rerender } = renderHook(() => usePictogramsBySlug(), { wrapper: wrap(qc) });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
