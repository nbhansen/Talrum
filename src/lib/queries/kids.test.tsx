import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TestSessionProvider } from '@/lib/auth/session.test-utils';
import type { Kid } from '@/types/domain';

interface MockPostgrestError {
  code: string;
  message: string;
  details: string;
  hint: string;
}

// Read-path chain: from('kids').select('*').order('created_at')
const orderMock = vi.fn<() => Promise<{ data: unknown; error: MockPostgrestError | null }>>();
const readSelectMock = vi.fn(() => ({ order: orderMock }));

// Write-path chain: from('kids').insert({...}).select().single()
const singleMock = vi.fn<() => Promise<{ data: unknown; error: MockPostgrestError | null }>>();
const insertSelectMock = vi.fn(() => ({ single: singleMock }));
const insertMock = vi.fn(() => ({ select: insertSelectMock }));

const fromMock = vi.fn((_table: string) => ({
  select: readSelectMock,
  insert: insertMock,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (table: string) => fromMock(table) },
}));

// Import after the mock is registered.
const { kidsQueryKey, useCreateKid, useKids } = await import('./kids');

const wrap = (qc: QueryClient): ((p: { children: ReactNode }) => JSX.Element) => {
  const Wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <TestSessionProvider>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </TestSessionProvider>
  );
  return Wrapper;
};

describe('useKids', () => {
  beforeEach(() => {
    orderMock.mockReset();
    readSelectMock.mockClear();
    singleMock.mockReset();
    insertSelectMock.mockClear();
    insertMock.mockClear();
    fromMock.mockClear();
  });

  it('fetches kids and maps rows to the domain shape', async () => {
    orderMock.mockResolvedValueOnce({
      data: [
        {
          id: 'k1',
          owner_id: 'owner-uuid',
          name: 'Liam',
          created_at: '2026-04-01T00:00:00Z',
        },
      ],
      error: null,
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useKids(), { wrapper: wrap(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual<Kid[]>([{ id: 'k1', ownerId: 'owner-uuid', name: 'Liam' }]);
    expect(fromMock).toHaveBeenCalledWith('kids');
  });
});

describe('useCreateKid', () => {
  beforeEach(() => {
    orderMock.mockReset();
    readSelectMock.mockClear();
    singleMock.mockReset();
    insertSelectMock.mockClear();
    insertMock.mockClear();
    fromMock.mockClear();
  });

  it('inserts with the trimmed name + session owner_id, returns the mapped Kid, and invalidates the kids list cache', async () => {
    singleMock.mockResolvedValueOnce({
      data: {
        id: 'k-new',
        owner_id: '00000000-0000-0000-0000-0000000000aa',
        name: 'Mira',
        created_at: '2026-04-26T12:00:00Z',
      },
      error: null,
    });

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useCreateKid(), { wrapper: wrap(qc) });

    let returned: Kid | undefined;
    await act(async () => {
      returned = await result.current.mutateAsync({ name: '  Mira  ' });
    });

    expect(returned).toEqual<Kid>({
      id: 'k-new',
      ownerId: '00000000-0000-0000-0000-0000000000aa',
      name: 'Mira',
    });
    expect(insertMock).toHaveBeenCalledWith({
      owner_id: '00000000-0000-0000-0000-0000000000aa',
      name: 'Mira',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: kidsQueryKey });
  });

  it('surfaces a Postgres RLS error as React Query error state', async () => {
    singleMock.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'row-level-security', details: '', hint: '' },
    });

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useCreateKid(), { wrapper: wrap(qc) });

    act(() => {
      result.current.mutate({ name: 'Mira' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: '42501' });
  });
});
