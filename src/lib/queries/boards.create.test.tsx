import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TestSessionProvider } from '@/lib/auth/session.test-utils';
import type { Board } from '@/types/domain';

interface MockPostgrestError {
  code: string;
  message: string;
  details: string;
  hint: string;
}

// Write-path chain: from('boards').insert({...}).select().single()
const singleMock = vi.fn<() => Promise<{ data: unknown; error: MockPostgrestError | null }>>();
const insertSelectMock = vi.fn(() => ({ single: singleMock }));
const insertMock = vi.fn(() => ({ select: insertSelectMock }));
const fromMock = vi.fn((_table: string) => ({ insert: insertMock }));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (table: string) => fromMock(table) },
}));

// Import after the mock is registered.
const { boardsQueryKey, useCreateBoard } = await import('./boards');

const wrap = (qc: QueryClient): ((p: { children: ReactNode }) => JSX.Element) => {
  const Wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <TestSessionProvider>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </TestSessionProvider>
  );
  return Wrapper;
};

const SERVER_ROW = {
  id: 'b-new',
  owner_id: '00000000-0000-0000-0000-0000000000aa',
  kid_id: 'k1',
  slug: null,
  name: 'Morning routine',
  kind: 'sequence',
  labels_visible: true,
  voice_mode: 'tts',
  step_ids: [] as string[],
  kid_reorderable: false,
  accent: 'sage',
  accent_ink: 'sage-ink',
  updated_at: '2026-04-26T12:00:00Z',
};

describe('useCreateBoard', () => {
  beforeEach(() => {
    singleMock.mockReset();
    insertSelectMock.mockClear();
    insertMock.mockClear();
    fromMock.mockClear();
  });

  it('inserts with sensible defaults, returns the mapped Board, and invalidates the boards list cache', async () => {
    singleMock.mockResolvedValueOnce({ data: SERVER_ROW, error: null });

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useCreateBoard(), { wrapper: wrap(qc) });

    let returned: Board | undefined;
    await act(async () => {
      returned = await result.current.mutateAsync({
        name: '  Morning routine  ',
        kind: 'sequence',
        kidId: 'k1',
      });
    });

    expect(fromMock).toHaveBeenCalledWith('boards');
    expect(insertMock).toHaveBeenCalledWith({
      owner_id: '00000000-0000-0000-0000-0000000000aa',
      kid_id: 'k1',
      name: 'Morning routine',
      kind: 'sequence',
      labels_visible: true,
      voice_mode: 'tts',
      step_ids: [],
      kid_reorderable: false,
      accent: 'sage',
      accent_ink: 'sage-ink',
    });
    expect(returned?.name).toBe('Morning routine');
    expect(returned?.kind).toBe('sequence');
    expect(returned?.kidId).toBe('k1');
    expect(returned?.id).toBe('b-new');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: boardsQueryKey });
  });

  it('honors a caller-supplied accent override', async () => {
    singleMock.mockResolvedValueOnce({
      data: { ...SERVER_ROW, accent: 'lavender', accent_ink: 'lavender-ink' },
      error: null,
    });

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useCreateBoard(), { wrapper: wrap(qc) });

    await act(async () => {
      await result.current.mutateAsync({
        name: 'Bedtime',
        kind: 'choice',
        kidId: 'k1',
        accent: { bg: 'lavender', ink: 'lavender-ink' },
      });
    });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ accent: 'lavender', accent_ink: 'lavender-ink', kind: 'choice' }),
    );
  });

  it('surfaces a Postgres RLS error as React Query error state', async () => {
    singleMock.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'row-level-security', details: '', hint: '' },
    });

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useCreateBoard(), { wrapper: wrap(qc) });

    act(() => {
      result.current.mutate({ name: 'X', kind: 'sequence', kidId: 'k1' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: '42501' });
  });
});
