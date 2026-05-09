import {
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import { useSessionUser } from '@/lib/auth/session';
import { enqueueAndDrain } from '@/lib/outbox';
import { boardsQueryKey } from '@/lib/queries/boards.read';
import { supabase } from '@/lib/supabase';
import type { Board, Kid } from '@/types/domain';
import type { Database } from '@/types/supabase';

type KidRow = Database['public']['Tables']['kids']['Row'];

export const rowToKid = (row: KidRow): Kid => ({
  id: row.id,
  ownerId: row.owner_id,
  name: row.name,
});

export const kidsQueryKey = ['kids'] as const;

const fetchKids = async (): Promise<Kid[]> => {
  const { data, error } = await supabase.from('kids').select('*').order('created_at');
  if (error) throw error;
  return data.map(rowToKid);
};

export const useKids = (): UseQueryResult<Kid[]> =>
  useQuery({ queryKey: kidsQueryKey, queryFn: fetchKids });

interface CreateKidInput {
  name: string;
}

/**
 * Direct Supabase insert (no outbox): the caller needs the row to exist on
 * the server before children can attach (e.g. defaulting a new board's
 * `kid_id`). An outbox-queued insert would surface RLS denials only at drain.
 */
export const useCreateKid = (): UseMutationResult<Kid, Error, CreateKidInput> => {
  const qc = useQueryClient();
  const ownerId = useSessionUser().id;
  return useMutation({
    mutationFn: async ({ name }) => {
      const { data, error } = await supabase
        .from('kids')
        .insert({ owner_id: ownerId, name })
        .select()
        .single();
      if (error) throw error;
      return rowToKid(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: kidsQueryKey });
    },
  });
};

const ACTIVE_KID_KEY = 'talrum:active-kid-id';
const activeKidListeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  // Cross-tab writes hit `storage`; same-tab writes notify via setActiveKidId.
  window.addEventListener('storage', (e) => {
    if (e.key === ACTIVE_KID_KEY) {
      for (const cb of activeKidListeners) cb();
    }
  });
}

const subscribeActiveKid = (cb: () => void): (() => void) => {
  activeKidListeners.add(cb);
  return () => {
    activeKidListeners.delete(cb);
  };
};

const getStoredActiveKidId = (): string | null => {
  try {
    return localStorage.getItem(ACTIVE_KID_KEY);
  } catch {
    return null;
  }
};

/**
 * Set the per-device active-kid id. Pass `null` to clear (e.g. when the
 * active kid is deleted — `useActiveKid` then falls back to the first kid).
 * Skips work and the fan-out when the value is unchanged so consumers don't
 * re-render on no-op writes (e.g. tapping the already-active switcher pill).
 */
export const setActiveKidId = (id: string | null): void => {
  if (getStoredActiveKidId() === id) return;
  try {
    if (id == null) localStorage.removeItem(ACTIVE_KID_KEY);
    else localStorage.setItem(ACTIVE_KID_KEY, id);
  } catch {
    // ignore quota / privacy mode — feature is best-effort
  }
  for (const cb of activeKidListeners) cb();
};

/**
 * Returns the currently-active kid for parent-home filtering. Backed by
 * localStorage (`talrum:active-kid-id`) so the choice survives reloads but
 * stays per-device — appropriate for a single-family-device app.
 *
 * Self-healing: if the stored id no longer matches a kid (deleted, swapped
 * accounts), falls back to the first kid in `useKids()`. Returns `null`
 * only when there are no kids at all.
 */
export const useActiveKid = (): Kid | null => {
  const { data: kids } = useKids();
  const storedId = useSyncExternalStore(subscribeActiveKid, getStoredActiveKidId, () => null);
  if (!kids || kids.length === 0) return null;
  return kids.find((k) => k.id === storedId) ?? kids[0] ?? null;
};

interface RenameKidInput {
  kidId: string;
  name: string;
}

export const useRenameKid = (): UseMutationResult<
  void,
  Error,
  RenameKidInput,
  { previous: Kid[] | undefined }
> => {
  const qc = useQueryClient();
  return useMutation({
    onMutate: async ({ kidId, name }) => {
      await qc.cancelQueries({ queryKey: kidsQueryKey });
      const previous = qc.getQueryData<Kid[]>(kidsQueryKey);
      qc.setQueryData<Kid[]>(kidsQueryKey, (list) =>
        list?.map((k) => (k.id === kidId ? { ...k, name } : k)),
      );
      return { previous };
    },
    mutationFn: ({ kidId, name }) => enqueueAndDrain({ kind: 'renameKid', kidId, name }),
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) qc.setQueryData(kidsQueryKey, ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: kidsQueryKey });
    },
  });
};

interface DeleteKidInput {
  kidId: string;
}

export const useDeleteKid = (): UseMutationResult<
  void,
  Error,
  DeleteKidInput,
  { previousKids: Kid[] | undefined; previousBoards: Board[] | undefined }
> => {
  const qc = useQueryClient();
  return useMutation({
    onMutate: async ({ kidId }) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: kidsQueryKey }),
        qc.cancelQueries({ queryKey: boardsQueryKey }),
      ]);
      const previousKids = qc.getQueryData<Kid[]>(kidsQueryKey);
      const previousBoards = qc.getQueryData<Board[]>(boardsQueryKey);
      qc.setQueryData<Kid[]>(kidsQueryKey, (list) => list?.filter((k) => k.id !== kidId));
      qc.setQueryData<Board[]>(boardsQueryKey, (list) => list?.filter((b) => b.kidId !== kidId));
      // Drop the stored id so useActiveKid's first-kid fallback picks up a
      // remaining one. The error rollback doesn't restore it — at worst the
      // active kid flickers back on the next render, which is fine.
      if (getStoredActiveKidId() === kidId) setActiveKidId(null);
      return { previousKids, previousBoards };
    },
    mutationFn: ({ kidId }) => enqueueAndDrain({ kind: 'deleteKid', kidId }),
    onError: (_err, _input, ctx) => {
      if (ctx?.previousKids) qc.setQueryData(kidsQueryKey, ctx.previousKids);
      if (ctx?.previousBoards) qc.setQueryData(boardsQueryKey, ctx.previousBoards);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: kidsQueryKey });
      qc.invalidateQueries({ queryKey: boardsQueryKey });
    },
  });
};
