import {
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { useSessionUser } from '@/lib/auth/session';
import { supabase } from '@/lib/supabase';
import type { Kid } from '@/types/domain';
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
 * Direct Supabase insert (no outbox), matching the `useAddBoardMember` pattern
 * in `board-members.ts`. Outbox would surface RLS denials only at drain — wrong
 * for create-then-react flows where the caller needs the row to actually exist
 * on the server (e.g. defaulting a new board's `kid_id`).
 */
export const useCreateKid = (): UseMutationResult<Kid, Error, CreateKidInput> => {
  const qc = useQueryClient();
  const ownerId = useSessionUser().id;
  return useMutation({
    mutationFn: async ({ name }) => {
      const { data, error } = await supabase
        .from('kids')
        .insert({ owner_id: ownerId, name: name.trim() })
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
