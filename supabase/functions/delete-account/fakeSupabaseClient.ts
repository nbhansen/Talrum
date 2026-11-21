// Hand-rolled stub matching the surface of @supabase/supabase-js that
// deleteAccount() consumes. Records every call in a flat log so tests can
// assert ordering (storage purges must happen before auth deletion).

import type { AdminClient } from './deleteAccount.ts';
import { AUDIO_BUCKET, IMAGES_BUCKET } from './types.ts';

interface CallLogEntry {
  kind: 'storage.list' | 'storage.remove' | 'auth.admin.deleteUser';
  bucket?: string;
  prefix?: string;
  paths?: readonly string[];
  userId?: string;
}

interface FakeOptions {
  audio?: string[];
  images?: string[];
  authDeleteError?: { message: string; code?: string };
  /** Return an error to fail this Storage call; `calls` already holds it. */
  fail?: (call: CallLogEntry, calls: CallLogEntry[]) => { message: string } | null;
}

// Models Storage: list() returns one level, with `id: null` for a folder, and
// remove() deletes exact paths only (#638). Typed as AdminClient so the
// compiler keeps the stub assignable to the real shape.
export const createFakeClient = (
  options: FakeOptions = {},
): { client: AdminClient; calls: CallLogEntry[]; stores: Record<string, Set<string>> } => {
  const calls: CallLogEntry[] = [];
  const stores: Record<string, Set<string>> = {
    [AUDIO_BUCKET]: new Set(options.audio),
    [IMAGES_BUCKET]: new Set(options.images),
  };

  const record = (call: CallLogEntry): { message: string } | null => {
    calls.push(call);
    return options.fail?.(call, calls) ?? null;
  };

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

  const client: AdminClient = {
    storage: {
      from: (bucket) => {
        const store = stores[bucket] ?? new Set<string>();
        return {
          list: async (prefix, opts) => {
            const error = record({ kind: 'storage.list', bucket, prefix });
            if (error) return { data: null, error };
            return { data: listStore(store, prefix, opts?.limit), error: null };
          },
          remove: async (paths) => {
            const error = record({ kind: 'storage.remove', bucket, paths });
            if (error) return { data: null, error };
            const removed = paths.filter((p) => store.delete(p));
            return { data: removed.map((name) => ({ name })), error: null };
          },
        };
      },
    },
    auth: {
      // Not exercised by deleteAccount tests, but required by the AdminClient
      // shape (handler also reaches for it). Returning a no-op user keeps the
      // type assignable without affecting deleteAccount behaviour.
      getUser: async () => ({ data: { user: null }, error: null }),
      admin: {
        deleteUser: async (userId) => {
          calls.push({ kind: 'auth.admin.deleteUser', userId });
          return { error: options.authDeleteError ?? null };
        },
      },
    },
  };
  return { client, calls, stores };
};
