import { del, get, set } from 'idb-keyval';
import { ulid } from 'ulid';

import { captureException } from '@/lib/platform/telemetry';
import { supabase } from '@/lib/supabase';

import { type SignedUrlEntry, signedUrlMemCache as memCache } from './storage-cache';

export const AUDIO_BUCKET = 'pictogram-audio';
export const IMAGES_BUCKET = 'pictogram-images';

/**
 * Marks an `image_path` as a bundled stock JPG (`/seed-photos/<slug>.jpg`)
 * rather than a Storage object. Seed templates ship these.
 */
export const STOCK_PATH_PREFIX = 'stock:';

/** True for real Storage paths (not stock sentinels, not empty). */
export const isUploadedStoragePath = (path: string | undefined): path is string =>
  !!path && !path.startsWith(STOCK_PATH_PREFIX);

/**
 * A unique path per upload (#415), so IO that lands late — an outbox run the
 * handler timeout abandoned — acts on a path no newer write owns. At worst it
 * leaks one orphan, never a newer upload. Minted once per entry, at enqueue,
 * so replays stay idempotent. The row is the truth about which object is live.
 */
export const mintStoragePath = (ownerId: string, pictogramId: string, extension: string): string =>
  `${ownerId}/${pictogramId}-${ulid()}.${extension}`;

const SIGNED_URL_TTL_SECONDS = 60 * 60;
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

export const removeFromBucket = async (bucket: string, paths: readonly string[]): Promise<void> => {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(bucket).remove([...paths]);
  if (error) throw error;
};

/**
 * Memory, then IDB, then a fresh mint. On mint failure, return a stale entry
 * rather than throw: the service worker serves the bytes from cache whatever
 * the token says, so a stale URL still renders a seen pictogram.
 */
export const signedUrlFor = async (bucket: string, path: string): Promise<string> => {
  // Optimistic creates render from a blob URL until the outbox uploads. For
  // those the path is already the URL.
  if (path.startsWith('blob:')) return path;
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
    captureException(err, {
      level: 'warning',
      tags: { component: 'storage', op: 'signedUrlFor' },
    });
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
