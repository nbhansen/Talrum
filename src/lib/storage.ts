import { supabase } from './supabase';

export const AUDIO_BUCKET = 'pictogram-audio';

const SIGNED_URL_TTL_SECONDS = 60 * 60;
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

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

export const signedUrlFor = async (bucket: string, path: string): Promise<string> => {
  const key = `${bucket}/${path}`;
  const now = Date.now();
  const cached = signedUrlCache.get(key);
  if (cached && cached.expiresAt > now + 30_000) return cached.url;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) throw error ?? new Error('could not sign storage url');
  signedUrlCache.set(key, {
    url: data.signedUrl,
    expiresAt: now + SIGNED_URL_TTL_SECONDS * 1000,
  });
  return data.signedUrl;
};

export const invalidateSignedUrl = (bucket: string, path: string): void => {
  signedUrlCache.delete(`${bucket}/${path}`);
};
