// Hand-rolled stub matching the surface of @supabase/supabase-js that
// deleteAccount() consumes. Records every call in a flat log so tests can
// assert ordering (storage purges must happen before auth deletion).

import type { AdminClient } from './deleteAccount.ts';

export interface CallLogEntry {
  kind: 'storage.list' | 'storage.remove' | 'auth.admin.deleteUser';
  bucket?: string;
  prefix?: string;
  paths?: readonly string[];
  userId?: string;
}

interface BucketScript {
  // Each list call shifts one page off the front. Empty array returned
  // when exhausted.
  listResponses: { data?: { name: string }[]; error?: { message: string } }[];
  // remove either succeeds (empty error) or fails with the given message,
  // optionally consumed once per call (so retries can hit different paths).
  removeResponses: { data?: { name: string }[]; error?: { message: string } }[];
}

export interface FakeOptions {
  buckets: Record<string, BucketScript>;
  authDelete: { ok: true } | { error: { message: string; code?: string } };
}

// FakeClient is structurally identical to AdminClient; alias rather than
// re-declare so the compiler enforces the stub stays assignable to the real
// shape. Drift gets caught at compile time, not runtime.
export type FakeClient = AdminClient;

export const createFakeClient = (
  options: FakeOptions,
): { client: FakeClient; calls: CallLogEntry[] } => {
  const calls: CallLogEntry[] = [];
  const remainingList: Record<string, BucketScript['listResponses']> = {};
  const remainingRemove: Record<string, BucketScript['removeResponses']> = {};
  for (const [bucket, script] of Object.entries(options.buckets)) {
    remainingList[bucket] = [...script.listResponses];
    remainingRemove[bucket] = [...script.removeResponses];
  }

  const client: FakeClient = {
    storage: {
      from: (bucket) => ({
        list: async (prefix) => {
          calls.push({ kind: 'storage.list', bucket, prefix });
          const next = remainingList[bucket]?.shift() ?? { data: [] };
          if (next.error) return { data: null, error: next.error };
          return { data: next.data ?? [], error: null };
        },
        remove: async (paths) => {
          calls.push({ kind: 'storage.remove', bucket, paths });
          const next = remainingRemove[bucket]?.shift() ?? { data: [] };
          if (next.error) return { data: null, error: next.error };
          return { data: next.data ?? [], error: null };
        },
      }),
    },
    auth: {
      admin: {
        deleteUser: async (userId) => {
          calls.push({ kind: 'auth.admin.deleteUser', userId });
          if ('ok' in options.authDelete) {
            return { error: null };
          }
          return { error: options.authDelete.error };
        },
      },
    },
  };
  return { client, calls };
};
