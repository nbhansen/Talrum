import { del, get, set } from 'idb-keyval';

import { supabase } from './supabase';

export const AUDIO_BUCKET = 'pictogram-audio';
export const IMAGES_BUCKET = 'pictogram-images';

const SIGNED_URL_TTL_SECONDS = 60 * 60;

interface SignedUrlEntry {
  url: string;
  expiresAt: number;
}

/**
 * Hot-path in-process cache. Mirrors what's persisted to IndexedDB; persists
 * across reloads via `loadPersisted()`. The two layers exist because IDB IO
 * is async and `signedUrlFor` is awaited on every render of an image tile —
 * the synchronous `Map` lookup short-circuits the common case.
 */
const memCache = new Map<string, SignedUrlEntry>();
const IDB_PREFIX = 'signed-url:';
const idbKey = (cacheKey: string): string => `${IDB_PREFIX}${cacheKey}`;

const readPersisted = async (cacheKey: string): Promise<SignedUrlEntry | null> => {
  const stored = await get<SignedUrlEntry>(idbKey(cacheKey));
  return stored ?? null;
};

const writePersisted = (cacheKey: string, entry: SignedUrlEntry): Promise<void> =>
  set(idbKey(cacheKey), entry);

export const uploadBlob = async (bucket: string, path: string, blob: Blob): Promise<void> => {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, { upsert: true, contentType: blob.type });
  if (error) throw error;
};

export const removeFromBucket = async (
  bucket: string,
  paths: readonly string[],
): Promise<void> => {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(bucket).remove([...paths]);
  if (error) throw error;
};

/**
 * Resolves a storage path to a signed URL with three escalating fallbacks:
 *
 *   1. Hot in-memory entry that's still valid → return immediately.
 *   2. Persisted IDB entry that's still valid → hydrate memory and return.
 *   3. Mint a fresh URL via Supabase, persist it, return.
 *
 * On mint failure (offline, transient network), return whichever stale entry
 * we have rather than throwing — the SW's CacheFirst plugin will serve the
 * bytes from cache regardless of token validity, so a "stale" URL still
 * resolves a valid `<img>` for a previously-viewed pictogram.
 */
export const signedUrlFor = async (bucket: string, path: string): Promise<string> => {
  const cacheKey = `${bucket}/${path}`;
  const now = Date.now();

  const fromMem = memCache.get(cacheKey);
  if (fromMem && fromMem.expiresAt > now + 30_000) return fromMem.url;

  if (!fromMem) {
    const fromIdb = await readPersisted(cacheKey);
    if (fromIdb) {
      memCache.set(cacheKey, fromIdb);
      if (fromIdb.expiresAt > now + 30_000) return fromIdb.url;
    }
  }

  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (error || !data) throw error ?? new Error('could not sign storage url');
    const entry: SignedUrlEntry = {
      url: data.signedUrl,
      expiresAt: now + SIGNED_URL_TTL_SECONDS * 1000,
    };
    memCache.set(cacheKey, entry);
    void writePersisted(cacheKey, entry);
    return data.signedUrl;
  } catch (err) {
    const fallback = memCache.get(cacheKey) ?? (await readPersisted(cacheKey));
    if (fallback) return fallback.url;
    throw err;
  }
};

export const invalidateSignedUrl = (bucket: string, path: string): void => {
  const cacheKey = `${bucket}/${path}`;
  memCache.delete(cacheKey);
  void del(idbKey(cacheKey));
};
