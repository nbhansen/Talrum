import { FunctionsHttpError } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// supabase-js wire shape:
//   2xx → { data, error: null }
//   4xx/5xx → { data: null, error: FunctionsHttpError } where error.context
//             holds the original Response. Tests must mirror this — mocking
//             a fictional `{ data: { ok: false, ... }, error: null }` shape
//             made the closed-set error mapping unreachable in production.
const invokeMock = vi.fn<
  (
    name: string,
    opts: { body: unknown },
  ) => Promise<{
    data: { ok: true } | null;
    error: FunctionsHttpError | { name: string; message: string } | null;
  }>
>();

const makeHttpError = (status: number, body: unknown): FunctionsHttpError => {
  const init: ResponseInit = {
    status,
    headers: { 'content-type': 'application/json' },
  };
  const response =
    typeof body === 'string' ? new Response(body, init) : new Response(JSON.stringify(body), init);
  return new FunctionsHttpError(response);
};
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

  it('on success without onPreSignOut: clears query cache then signs out', async () => {
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

    const { result } = renderHook(() => useDeleteMyAccount({ injectedClient: qc }), {
      wrapper: makeWrapper(qc),
    });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(order).toEqual(['clear', 'signOut']);
    expect(qc.getQueryData(['boards'])).toBeUndefined();
  });

  // Pins the contract DeleteAccountSection relies on: onPreSignOut MUST run
  // between cache clear and signOut. supabase-js fires SIGNED_OUT
  // synchronously from inside signOut(), and AuthGate's listener will
  // unmount the dialog the moment the event lands — so any navigation has
  // to happen before signOut is awaited.
  it('on success with onPreSignOut: runs clear, onPreSignOut, signOut in that order', async () => {
    invokeMock.mockResolvedValueOnce({ data: { ok: true }, error: null });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
    const onPreSignOut = vi.fn(() => {
      order.push('preSignOut');
    });

    const { result } = renderHook(() => useDeleteMyAccount({ injectedClient: qc, onPreSignOut }), {
      wrapper: makeWrapper(qc),
    });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(order).toEqual(['clear', 'preSignOut', 'signOut']);
    expect(onPreSignOut).toHaveBeenCalledTimes(1);
  });

  it('on error: does NOT clear cache, sign out, or call onPreSignOut', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: makeHttpError(500, { ok: false, error: 'auth_delete_failed', message: 'boom' }),
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(['boards'], [{ id: 'b1' }]);
    const onPreSignOut = vi.fn();

    const { result } = renderHook(() => useDeleteMyAccount({ injectedClient: qc, onPreSignOut }), {
      wrapper: makeWrapper(qc),
    });
    result.current.mutate();
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(qc.getQueryData(['boards'])).toEqual([{ id: 'b1' }]);
    expect(signOutMock).not.toHaveBeenCalled();
    expect(onPreSignOut).not.toHaveBeenCalled();
    expect((result.current.error as InstanceType<typeof DeleteAccountError>).code).toBe(
      'auth_delete_failed',
    );
  });

  // Pins the production wire path: closed-set codes arrive inside a
  // FunctionsHttpError body, NOT as a 2xx { ok: false, ... } payload.
  // supabase-js routes 4xx/5xx into `error`, not `data`.
  it.each([
    ['unauthorized', 401],
    ['method_not_allowed', 405],
    ['bad_request', 400],
    ['storage_purge_failed', 500],
    ['auth_delete_failed', 500],
    ['internal_error', 500],
  ] as const)('translates %s from a FunctionsHttpError body', async (code, status) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: makeHttpError(status, { ok: false, error: code, message: 'm' }),
    });
    const { result } = renderHook(() => useDeleteMyAccount({ injectedClient: qc }), {
      wrapper: makeWrapper(qc),
    });
    result.current.mutate();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as InstanceType<typeof DeleteAccountError>).code).toBe(code);
  });

  it('falls back to internal_error when the FunctionsHttpError body is not JSON', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: makeHttpError(500, 'not json at all'),
    });
    const { result } = renderHook(() => useDeleteMyAccount({ injectedClient: qc }), {
      wrapper: makeWrapper(qc),
    });
    result.current.mutate();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as InstanceType<typeof DeleteAccountError>).code).toBe(
      'internal_error',
    );
  });

  it('falls back to internal_error when the body is JSON but missing the error field', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: makeHttpError(500, { not_an_error_field: 'x' }),
    });
    const { result } = renderHook(() => useDeleteMyAccount({ injectedClient: qc }), {
      wrapper: makeWrapper(qc),
    });
    result.current.mutate();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as InstanceType<typeof DeleteAccountError>).code).toBe(
      'internal_error',
    );
  });

  it('falls back to internal_error for non-FunctionsHttpError errors (network blip)', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: { name: 'FunctionsFetchError', message: 'network blip' },
    });
    const { result } = renderHook(() => useDeleteMyAccount({ injectedClient: qc }), {
      wrapper: makeWrapper(qc),
    });
    result.current.mutate();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as InstanceType<typeof DeleteAccountError>).code).toBe(
      'internal_error',
    );
  });

  // The user clicked "delete forever" once. We must not silently re-fire on
  // failure — TanStack defaults mutations to retry: 0 in v5, but pin it here
  // so a future default change or an accidental `retry: 3` fails this test.
  it('does NOT auto-retry on error: mutationFn runs exactly once', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: makeHttpError(500, { ok: false, error: 'auth_delete_failed', message: 'boom' }),
    });
    // No retry override on the QueryClient — we want to observe the hook's
    // own mutation behaviour, not a client-level suppression.
    const qc = new QueryClient();

    const { result } = renderHook(() => useDeleteMyAccount({ injectedClient: qc }), {
      wrapper: makeWrapper(qc),
    });
    result.current.mutate();
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(invokeMock).toHaveBeenCalledTimes(1);
  });
});
