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

// Models Storage instead of a script: list() returns one level, with
// `id: null` for a folder, and remove() deletes exact paths only (#638).
interface BucketStore {
  objects: string[];
}

export interface FakeOptions {
  buckets: Record<string, BucketScript | BucketStore>;
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
  const stores: Record<string, Set<string>> = {};
  for (const [bucket, script] of Object.entries(options.buckets)) {
    if ('objects' in script) {
      stores[bucket] = new Set(script.objects);
      continue;
    }
    remainingList[bucket] = [...script.listResponses];
    remainingRemove[bucket] = [...script.removeResponses];
  }

  const listStore = (store: Set<string>, prefix: string, limit = 100) => {
    const entries = new Map<string, string | null>();
    for (const path of store) {
      if (!path.startsWith(`${prefix}/`)) continue;
      const rest = path.slice(prefix.length + 1);
      const slash = rest.indexOf('/');
      entries.set(slash === -1 ? rest : rest.slice(0, slash), slash === -1 ? path : null);
    }
    return [...entries].slice(0, limit).map(([name, id]) => ({ name, id }));
  };

  const client: FakeClient = {
    storage: {
      from: (bucket) => ({
        list: async (prefix, opts) => {
          calls.push({ kind: 'storage.list', bucket, prefix });
          const store = stores[bucket];
          if (store) return { data: listStore(store, prefix, opts?.limit), error: null };
          const next = remainingList[bucket]?.shift() ?? { data: [] };
          if (next.error) return { data: null, error: next.error };
          return { data: (next.data ?? []).map((o) => ({ ...o, id: o.name })), error: null };
        },
        remove: async (paths) => {
          calls.push({ kind: 'storage.remove', bucket, paths });
          const store = stores[bucket];
          if (store) {
            const removed = paths.filter((p) => store.delete(p));
            return { data: removed.map((name) => ({ name })), error: null };
          }
          const next = remainingRemove[bucket]?.shift() ?? { data: [] };
          if (next.error) return { data: null, error: next.error };
          return { data: next.data ?? [], error: null };
        },
      }),
    },
    auth: {
      // Not exercised by deleteAccount tests, but required by the AdminClient
      // shape (handler also reaches for it). Returning a no-op user keeps the
      // type assignable without affecting deleteAccount behaviour.
      getUser: async () => ({ data: { user: null }, error: null }),
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
