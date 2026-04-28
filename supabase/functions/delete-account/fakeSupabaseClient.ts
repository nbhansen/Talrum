// Hand-rolled stub matching the surface of @supabase/supabase-js that
// deleteAccount() consumes. Records every call in a flat log so tests can
// assert ordering (storage purges must happen before auth deletion).

import type { ErrorCode } from './types.ts';

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
  listResponses: Array<{ data?: Array<{ name: string }>; error?: { message: string } }>;
  // remove either succeeds (empty error) or fails with the given message,
  // optionally consumed once per call (so retries can hit different paths).
  removeResponses: Array<{ data?: Array<{ name: string }>; error?: { message: string } }>;
}

export interface FakeOptions {
  buckets: Record<string, BucketScript>;
  authDelete: { ok: true } | { error: { message: string } };
}

export interface FakeClient {
  storage: {
    from: (bucket: string) => {
      list: (
        prefix: string,
        opts?: { limit?: number },
      ) => Promise<{ data: Array<{ name: string }> | null; error: { message: string } | null }>;
      remove: (
        paths: string[],
      ) => Promise<{ data: Array<{ name: string }> | null; error: { message: string } | null }>;
    };
  };
  auth: {
    admin: {
      deleteUser: (uid: string) => Promise<{ error: { message: string } | null }>;
    };
  };
}

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
