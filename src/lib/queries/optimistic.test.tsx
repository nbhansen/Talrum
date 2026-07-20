import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { listCache, useOptimisticListMutation } from './optimistic';

interface Item {
  id: string;
  name: string;
}

interface RenameInput {
  id: string;
  name: string;
}

const itemsKey = ['items'] as const;
const mirrorKey = ['mirror'] as const;

const seed = (): Item[] => [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Beta' },
];

const renameCache = (queryKey: readonly unknown[]) =>
  listCache<Item, RenameInput>(queryKey, (list, { id, name }) =>
    list?.map((item) => (item.id === id ? { ...item, name } : item)),
  );

const makeClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

const makeWrapper = (qc: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

/** mutationFn blocked on a promise the test resolves/rejects explicitly. */
const deferredMutation = (): {
  mutationFn: () => Promise<void>;
  resolve: () => void;
  reject: (err: Error) => void;
} => {
  let resolve: () => void = () => {
    throw new Error('resolver not assigned');
  };
  let reject: (err: Error) => void = () => {
    throw new Error('rejecter not assigned');
  };
  const gate = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { mutationFn: () => gate, resolve, reject };
};

describe('listCache', () => {
  it('applies the patch to the current cache contents', () => {
    const qc = makeClient();
    qc.setQueryData(itemsKey, seed());

    renameCache(itemsKey).apply(qc, { id: 'a', name: 'Renamed' });

    expect(qc.getQueryData<Item[]>(itemsKey)).toEqual([
      { id: 'a', name: 'Renamed' },
      { id: 'b', name: 'Beta' },
    ]);
  });

  it('does not create a cache entry when the patch returns undefined for an empty cache', () => {
    const qc = makeClient();

    renameCache(itemsKey).apply(qc, { id: 'a', name: 'Renamed' });

    // React Query treats an updater returning undefined as "bail out" — an
    // uninitialized cache must stay uninitialized, not become [].
    expect(qc.getQueryData(itemsKey)).toBeUndefined();
  });
});

describe('useOptimisticListMutation', () => {
  it('patches the cache before the mutation resolves, then invalidates on settle', async () => {
    const qc = makeClient();
    qc.setQueryData(itemsKey, seed());
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const { mutationFn, resolve } = deferredMutation();

    const { result } = renderHook(
      () => useOptimisticListMutation({ caches: [renameCache(itemsKey)], mutationFn }),
      { wrapper: makeWrapper(qc) },
    );

    act(() => {
      result.current.mutate({ id: 'a', name: 'Renamed' });
    });

    // The optimistic window: the server hasn't answered, the cache already has.
    await waitFor(() => {
      expect(qc.getQueryData<Item[]>(itemsKey)?.find((i) => i.id === 'a')?.name).toBe('Renamed');
    });
    expect(qc.getQueryData<Item[]>(itemsKey)?.find((i) => i.id === 'b')?.name).toBe('Beta');
    expect(invalidateSpy).not.toHaveBeenCalled();

    resolve();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryData<Item[]>(itemsKey)?.find((i) => i.id === 'a')?.name).toBe('Renamed');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: itemsKey });
  });

  it('discards an in-flight stale fetch instead of letting it clobber the optimistic patch', async () => {
    const qc = makeClient();
    qc.setQueryData(itemsKey, seed());
    let resolveFetch: (items: Item[]) => void = () => {
      throw new Error('resolver not assigned');
    };
    // A refetch that started before the mutation and answers with pre-mutation
    // data — exactly the race onMutate's cancelQueries exists to close.
    const staleFetch = qc.fetchQuery({
      queryKey: itemsKey,
      queryFn: () => new Promise<Item[]>((r) => (resolveFetch = r)),
      staleTime: 0,
    });
    staleFetch.catch(() => {
      // fetchQuery rejects with CancelledError once onMutate cancels it.
    });
    const { mutationFn, resolve } = deferredMutation();

    const { result } = renderHook(
      () => useOptimisticListMutation({ caches: [renameCache(itemsKey)], mutationFn }),
      { wrapper: makeWrapper(qc) },
    );

    act(() => {
      result.current.mutate({ id: 'a', name: 'Renamed' });
    });
    await waitFor(() => {
      expect(qc.getQueryData<Item[]>(itemsKey)?.find((i) => i.id === 'a')?.name).toBe('Renamed');
    });

    resolveFetch(seed());
    // Macrotask flush so React Query fully processes the resolved fetch —
    // a microtask tick is not enough and would pass even without cancellation.
    await act(() => new Promise((r) => setTimeout(r, 20)));

    expect(qc.getQueryData<Item[]>(itemsKey)?.find((i) => i.id === 'a')?.name).toBe('Renamed');

    resolve();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('patches, rolls back, and invalidates every cache when the mutation touches several', async () => {
    const qc = makeClient();
    qc.setQueryData(itemsKey, seed());
    qc.setQueryData(mirrorKey, seed());
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const { mutationFn, reject } = deferredMutation();

    const { result } = renderHook(
      () =>
        useOptimisticListMutation({
          caches: [renameCache(itemsKey), renameCache(mirrorKey)],
          mutationFn,
        }),
      { wrapper: makeWrapper(qc) },
    );

    act(() => {
      result.current.mutate({ id: 'b', name: 'Renamed' });
    });

    await waitFor(() => {
      expect(qc.getQueryData<Item[]>(itemsKey)?.find((i) => i.id === 'b')?.name).toBe('Renamed');
    });
    expect(qc.getQueryData<Item[]>(mirrorKey)?.find((i) => i.id === 'b')?.name).toBe('Renamed');

    reject(new Error('server said no'));
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(qc.getQueryData<Item[]>(itemsKey)).toEqual(seed());
    expect(qc.getQueryData<Item[]>(mirrorKey)).toEqual(seed());
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: itemsKey });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: mirrorKey });
  });

  it('leaves a cache that was empty pre-mutation unrestored on error and relies on invalidation', async () => {
    const qc = makeClient();
    qc.setQueryData(itemsKey, seed());
    // mirrorKey never seeded: its snapshot is undefined, so rollback skips it
    // and the settle invalidation is what heals it.
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const { mutationFn, reject } = deferredMutation();

    const { result } = renderHook(
      () =>
        useOptimisticListMutation({
          caches: [renameCache(itemsKey), renameCache(mirrorKey)],
          mutationFn,
        }),
      { wrapper: makeWrapper(qc) },
    );

    act(() => {
      result.current.mutate({ id: 'a', name: 'Renamed' });
    });
    reject(new Error('server said no'));
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(qc.getQueryData<Item[]>(itemsKey)).toEqual(seed());
    expect(qc.getQueryData(mirrorKey)).toBeUndefined();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: mirrorKey });
  });

  it('runs onMutateSideEffect after the patch and does not roll it back on error', async () => {
    const qc = makeClient();
    qc.setQueryData(itemsKey, seed());
    const seenDuringSideEffect: (string | undefined)[] = [];
    const sideEffect = vi.fn((input: RenameInput) => {
      seenDuringSideEffect.push(
        qc.getQueryData<Item[]>(itemsKey)?.find((i) => i.id === input.id)?.name,
      );
    });
    const { mutationFn, reject } = deferredMutation();

    const { result } = renderHook(
      () =>
        useOptimisticListMutation({
          caches: [renameCache(itemsKey)],
          mutationFn,
          onMutateSideEffect: sideEffect,
        }),
      { wrapper: makeWrapper(qc) },
    );

    act(() => {
      result.current.mutate({ id: 'a', name: 'Renamed' });
    });
    reject(new Error('server said no'));
    await waitFor(() => expect(result.current.isError).toBe(true));

    // Ran once, observed the already-patched cache, stayed ran after rollback.
    expect(sideEffect).toHaveBeenCalledTimes(1);
    expect(seenDuringSideEffect).toEqual(['Renamed']);
    expect(qc.getQueryData<Item[]>(itemsKey)).toEqual(seed());
  });

  it('a custom settle replaces the default invalidation entirely', async () => {
    const qc = makeClient();
    qc.setQueryData(itemsKey, seed());
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const settle = vi.fn();

    const { result } = renderHook(
      () =>
        useOptimisticListMutation({
          caches: [renameCache(itemsKey)],
          mutationFn: () => Promise.resolve(),
          settle,
        }),
      { wrapper: makeWrapper(qc) },
    );

    act(() => {
      result.current.mutate({ id: 'a', name: 'Renamed' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(settle).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('runs the custom settle on the error path too', async () => {
    const qc = makeClient();
    qc.setQueryData(itemsKey, seed());
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const settle = vi.fn();

    const { result } = renderHook(
      () =>
        useOptimisticListMutation({
          caches: [renameCache(itemsKey)],
          mutationFn: () => Promise.reject(new Error('server said no')),
          settle,
        }),
      { wrapper: makeWrapper(qc) },
    );

    act(() => {
      result.current.mutate({ id: 'a', name: 'Renamed' });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(qc.getQueryData<Item[]>(itemsKey)).toEqual(seed());
    expect(settle).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
