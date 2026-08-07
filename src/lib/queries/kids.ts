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
import { captureException } from '@/lib/platform/telemetry';
import { boardsQueryKey } from '@/lib/queries/boards.read';
import {
  listCache,
  type OptimisticListContext,
  useOptimisticListMutation,
} from '@/lib/queries/optimistic';
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
 * Direct insert, no outbox: a new board's `kid_id` needs this row to exist on
 * the server already. See docs/queries.md for the decision rule.
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

// This is a useSyncExternalStore getSnapshot, so it runs every render, and a
// blocked localStorage stays blocked. Latch, or the signal arrives per render.
let reportedReadFailure = false;
let reportedWriteFailure = false;

const getStoredActiveKidId = (): string | null => {
  try {
    return localStorage.getItem(ACTIVE_KID_KEY);
  } catch (err) {
    // App state, not a preference: losing it changes which boards the parent
    // sees, so the fallback must not be silent (#359).
    if (!reportedReadFailure) {
      reportedReadFailure = true;
      captureException(err, { level: 'warning', tags: { component: 'activeKid', op: 'read' } });
    }
    return null;
  }
};

/**
 * `null` clears it, and `useActiveKid` falls back to the first kid. An unchanged
 * value skips the fan-out, so tapping the active switcher pill re-renders
 * nothing.
 */
export const setActiveKidId = (id: string | null): void => {
  if (getStoredActiveKidId() === id) return;
  try {
    if (id == null) localStorage.removeItem(ACTIVE_KID_KEY);
    else localStorage.setItem(ACTIVE_KID_KEY, id);
  } catch (err) {
    // Latched like the read path: the block is persistent and every switcher
    // tap runs this write (#359).
    if (!reportedWriteFailure) {
      reportedWriteFailure = true;
      captureException(err, { level: 'warning', tags: { component: 'activeKid', op: 'write' } });
    }
  }
  for (const cb of activeKidListeners) cb();
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
    // The rollback does not restore this, so at worst the active kid flickers
    // back on the next render.
    onMutateSideEffect: ({ kidId }) => {
      if (getStoredActiveKidId() === kidId) setActiveKidId(null);
    },
    mutationFn: ({ kidId }) => enqueueAndDrain({ kind: 'deleteKid', kidId }),
  });
