import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn<
  (
    name: string,
    opts: { body: unknown },
  ) => Promise<{
    data: { ok: boolean; error?: string; message?: string } | null;
    error: { message: string } | null;
  }>
>();
const signOutMock = vi.fn<() => Promise<{ error: null }>>(async () => ({ error: null }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (name: string, opts: { body: unknown }) => invokeMock(name, opts) },
    auth: { signOut: () => signOutMock() },
  },
}));

const { mapErrorCode, DeleteAccountError, useDeleteMyAccount } = await import('./account');

const makeWrapper = (qc: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

beforeEach(() => {
  invokeMock.mockReset();
  signOutMock.mockClear();
});

describe('mapErrorCode', () => {
  it('returns a DeleteAccountError with the closed-set code', () => {
    const err = mapErrorCode({ ok: false, error: 'storage_purge_failed', message: 'm' });
    expect(err).toBeInstanceOf(DeleteAccountError);
    expect(err.code).toBe('storage_purge_failed');
    expect(err.message).toBe('m');
  });

  it('falls back to internal_error for unknown codes', () => {
    const err = mapErrorCode({ ok: false, error: 'who_knows', message: 'x' } as never);
    expect(err.code).toBe('internal_error');
  });
});

describe('useDeleteMyAccount', () => {
  it('invokes the edge function with body {}', async () => {
    invokeMock.mockResolvedValueOnce({ data: { ok: true }, error: null });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useDeleteMyAccount(), { wrapper: makeWrapper(qc) });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invokeMock).toHaveBeenCalledWith('delete-account', { body: {} });
  });

  it('on success: clears query cache then signs out (in that order)', async () => {
    invokeMock.mockResolvedValueOnce({ data: { ok: true }, error: null });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(['boards'], [{ id: 'b1' }]);
    const order: string[] = [];
    const origClear = qc.clear.bind(qc);
    qc.clear = () => {
      order.push('clear');
      origClear();
    };
    signOutMock.mockImplementationOnce(async () => {
      order.push('signOut');
      return { error: null };
    });

    const { result } = renderHook(() => useDeleteMyAccount(qc), { wrapper: makeWrapper(qc) });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(order).toEqual(['clear', 'signOut']);
    expect(qc.getQueryData(['boards'])).toBeUndefined();
  });

  it('on error: does NOT clear cache or sign out', async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: false, error: 'auth_delete_failed', message: 'boom' },
      error: null,
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(['boards'], [{ id: 'b1' }]);

    const { result } = renderHook(() => useDeleteMyAccount(qc), { wrapper: makeWrapper(qc) });
    result.current.mutate();
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(qc.getQueryData(['boards'])).toEqual([{ id: 'b1' }]);
    expect(signOutMock).not.toHaveBeenCalled();
    expect((result.current.error as InstanceType<typeof DeleteAccountError>).code).toBe(
      'auth_delete_failed',
    );
  });

  it('translates the closed-set error codes via mapErrorCode', async () => {
    const codes = [
      'unauthorized',
      'storage_purge_failed',
      'auth_delete_failed',
      'internal_error',
    ] as const;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    for (const code of codes) {
      invokeMock.mockReset();
      invokeMock.mockResolvedValueOnce({
        data: { ok: false, error: code, message: 'm' },
        error: null,
      });
      const { result, unmount } = renderHook(() => useDeleteMyAccount(qc), {
        wrapper: makeWrapper(qc),
      });
      result.current.mutate();
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect((result.current.error as InstanceType<typeof DeleteAccountError>).code).toBe(code);
      unmount();
    }
  });

  // The user clicked "delete forever" once. We must not silently re-fire on
  // failure — TanStack defaults mutations to retry: 0 in v5, but pin it here
  // so a future default change or an accidental `retry: 3` fails this test.
  it('does NOT auto-retry on error: mutationFn runs exactly once', async () => {
    invokeMock.mockResolvedValue({
      data: { ok: false, error: 'auth_delete_failed', message: 'boom' },
      error: null,
    });
    // No retry override on the QueryClient — we want to observe the hook's
    // own mutation behaviour, not a client-level suppression.
    const qc = new QueryClient();

    const { result } = renderHook(() => useDeleteMyAccount(qc), { wrapper: makeWrapper(qc) });
    result.current.mutate();
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(invokeMock).toHaveBeenCalledTimes(1);
  });
});
