import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { boardQueryKey } from '@/lib/queries/boards';
import type { Board } from '@/types/domain';

const eqMock = vi.fn<(column: string, value: string) => Promise<{ error: Error | null }>>();
const updateMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn((_table: string) => ({ update: updateMock }));

vi.mock('@/lib/supabase', () => ({ supabase: { from: (table: string) => fromMock(table) } }));

// Import after the mock is registered.
const { useRenameBoard } = await import('./mutations');

const seed: Board = {
  id: 'morning',
  ownerId: 'owner-uuid',
  kidId: 'liam',
  name: 'Morning routine',
  kind: 'sequence',
  labelsVisible: true,
  voiceMode: 'tts',
  stepIds: ['wakeup'],
  accent: 'peach',
  accentInk: 'peach-ink',
  updatedLabel: 'Edited just now',
};

const makeWrapper = (qc: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

describe('useRenameBoard (useBoardPatch)', () => {
  beforeEach(() => {
    eqMock.mockReset();
    updateMock.mockClear();
    fromMock.mockClear();
  });

  it('applies an optimistic cache patch before the DB responds', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(boardQueryKey('morning'), seed);

    // Block the mutation so we can observe the optimistic state.
    let resolveEq: (v: { error: null }) => void = () => {
      throw new Error('resolver not assigned');
    };
    eqMock.mockReturnValue(new Promise((r) => (resolveEq = r)));

    const { result } = renderHook(() => useRenameBoard(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({ boardId: 'morning', name: 'Sunrise' });
    });

    await waitFor(() => {
      expect(qc.getQueryData<Board>(boardQueryKey('morning'))?.name).toBe('Sunrise');
    });

    resolveEq({ error: null });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('rolls back the cache when the DB write errors', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    qc.setQueryData(boardQueryKey('morning'), seed);

    eqMock.mockResolvedValueOnce({ error: new Error('row-level-security') });

    const { result } = renderHook(() => useRenameBoard(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({ boardId: 'morning', name: 'Sunrise' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData<Board>(boardQueryKey('morning'))?.name).toBe('Morning routine');
  });
});
