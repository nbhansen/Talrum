import {
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import { getStoredActiveKidId, setActiveKidId, subscribeActiveKid } from '@/lib/activeKid';
import { useSessionUser } from '@/lib/auth/session';
import { enqueueAndDrain } from '@/lib/outbox';
import { boardsQueryKey } from '@/lib/queries/boards.read';
import { byCreatedAt, fetchAllRows } from '@/lib/queries/fetchAllRows';
import {
  listCache,
  type OptimisticListContext,
  useOptimisticListMutation,
} from '@/lib/queries/optimistic';
import { supabase } from '@/lib/supabase';
import type { Board, Kid } from '@/types/domain';
import type { Database } from '@/types/supabase';

type KidRow = Database['public']['Tables']['kids']['Row'];

const rowToKid = (row: KidRow): Kid => ({
  id: row.id,
  ownerId: row.owner_id,
  name: row.name,
});

export const kidsQueryKey = ['kids'] as const;

const fetchKids = async (): Promise<Kid[]> => {
  const rows = await fetchAllRows(() => supabase.from('kids').select('*'));
  return rows.sort(byCreatedAt).map(rowToKid);
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

/**
 * Backed by localStorage, so the choice survives a reload but stays per-device.
 * Self-healing: a stored id that matches no kid falls back to the first one.
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
  OptimisticListContext
> =>
  useOptimisticListMutation({
    caches: [
      listCache<Kid, RenameKidInput>(kidsQueryKey, (list, { kidId, name }) =>
        list?.map((k) => (k.id === kidId ? { ...k, name } : k)),
      ),
    ],
    mutationFn: ({ kidId, name }) => enqueueAndDrain({ kind: 'renameKid', kidId, name }),
  });

interface DeleteKidInput {
  kidId: string;
}

export const useDeleteKid = (): UseMutationResult<
  void,
  Error,
  DeleteKidInput,
  OptimisticListContext
> =>
  useOptimisticListMutation({
    caches: [
      listCache<Kid, DeleteKidInput>(kidsQueryKey, (list, { kidId }) =>
        list?.filter((k) => k.id !== kidId),
      ),
      listCache<Board, DeleteKidInput>(boardsQueryKey, (list, { kidId }) =>
        list?.filter((b) => b.kidId !== kidId),
      ),
    ],
    // Drop the stored id so useActiveKid's first-kid fallback picks up a
    // remaining one. The error rollback doesn't restore it — at worst the
    // active kid flickers back on the next render, which is fine.
    onMutateSideEffect: ({ kidId }) => {
      if (getStoredActiveKidId() === kidId) setActiveKidId(null);
    },
    mutationFn: ({ kidId }) => enqueueAndDrain({ kind: 'deleteKid', kidId }),
  });
