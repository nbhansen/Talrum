import {
  type QueryClient,
  useMutation,
  type UseMutationResult,
  useQueryClient,
} from '@tanstack/react-query';

/**
 * One optimistic list cache touched by a mutation. Built via `listCache` so
 * each cache keeps its own item type without leaking a generic into the
 * heterogeneous `caches` array — the item type lives inside the closure.
 */
export interface ListCache<Input> {
  queryKey: readonly unknown[];
  apply: (qc: QueryClient, input: Input) => void;
}

export const listCache = <Item, Input>(
  queryKey: readonly unknown[],
  patch: (list: Item[] | undefined, input: Input) => Item[] | undefined,
): ListCache<Input> => ({
  queryKey,
  apply: (qc, input) => {
    qc.setQueryData<Item[]>(queryKey, (list) => patch(list, input));
  },
});

export interface OptimisticListContext {
  /** Pre-mutation snapshot per cache, index-aligned with `caches`. */
  snapshots: (unknown[] | undefined)[];
}

/**
 * List-keyed sibling of `useBoardPatch` (boards.mutations.ts): the
 * cancel → snapshot → patch → rollback → invalidate triad for whole-list
 * caches, over one or more caches per mutation.
 */
export const useOptimisticListMutation = <Input>(options: {
  caches: readonly ListCache<Input>[];
  mutationFn: (input: Input) => Promise<void>;
  /** Runs after the cache patches in onMutate; NOT rolled back on error. */
  onMutateSideEffect?: (input: Input) => void;
  /**
   * REPLACES the default settle (invalidate every cache key) — it does not
   * run in addition. A custom settle must invalidate every cache itself.
   */
  settle?: () => void;
}): UseMutationResult<void, Error, Input, OptimisticListContext> => {
  const qc = useQueryClient();
  const { caches, mutationFn, onMutateSideEffect, settle } = options;
  return useMutation({
    mutationFn,
    onMutate: async (input) => {
      await Promise.all(caches.map((c) => qc.cancelQueries({ queryKey: c.queryKey })));
      const snapshots = caches.map((c) => qc.getQueryData<unknown[]>(c.queryKey));
      for (const c of caches) c.apply(qc, input);
      onMutateSideEffect?.(input);
      return { snapshots };
    },
    onError: (_err, _input, ctx) => {
      if (!ctx) return;
      caches.forEach((c, i) => {
        const snapshot = ctx.snapshots[i];
        if (snapshot) qc.setQueryData(c.queryKey, snapshot);
      });
    },
    onSettled: () => {
      if (settle) {
        settle();
        return;
      }
      for (const c of caches) qc.invalidateQueries({ queryKey: c.queryKey });
    },
  });
};
