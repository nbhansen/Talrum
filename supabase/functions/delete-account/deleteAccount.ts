import {
  AUDIO_BUCKET,
  DeletionError,
  IMAGES_BUCKET,
  STORAGE_LIST_LIMIT,
  STORAGE_RETRY_ATTEMPTS,
} from './types.ts';

export interface AdminClient {
  storage: {
    from: (bucket: string) => {
      list: (
        prefix: string,
        opts?: { limit?: number },
      ) => Promise<{
        data: { name: string; id: string | null }[] | null;
        error: { message: string } | null;
      }>;
      remove: (
        paths: string[],
      ) => Promise<{ data: { name: string }[] | null; error: { message: string } | null }>;
    };
  };
  auth: {
    getUser: (jwt: string | undefined) => Promise<{
      data: { user: { id: string } | null };
      error: unknown;
    }>;
    admin: {
      deleteUser: (uid: string) => Promise<{
        error: { message: string; code?: string } | null;
      }>;
    };
  };
}

const purgeBucket = async (
  client: AdminClient,
  bucket: string,
  prefix: string,
  step: 'storage_purge_audio' | 'storage_purge_images',
): Promise<number> => {
  let removed = 0;
  // Drain the prefix one page at a time until list returns empty.
  for (let safety = 0; safety < 1000; safety++) {
    const { data, error } = await client.storage
      .from(bucket)
      .list(prefix, { limit: STORAGE_LIST_LIMIT });
    if (error) {
      throw new DeletionError('storage_purge_failed', step, `list ${bucket}: ${error.message}`);
    }
    if (!data || data.length === 0) return removed;

    // list() is one level deep; a folder entry has a null id (#638).
    for (const folder of data.filter((o) => o.id === null)) {
      removed += await purgeBucket(client, bucket, `${prefix}/${folder.name}`, step);
    }
    const paths = data.filter((o) => o.id !== null).map((o) => `${prefix}/${o.name}`);
    if (paths.length === 0) continue;
    let lastError: { message: string } | null = null;
    for (let attempt = 0; attempt < STORAGE_RETRY_ATTEMPTS; attempt++) {
      const removeResult = await client.storage.from(bucket).remove(paths);
      if (!removeResult.error) {
        lastError = null;
        break;
      }
      lastError = removeResult.error;
    }
    if (lastError) {
      throw new DeletionError(
        'storage_purge_failed',
        step,
        `remove ${bucket} after ${STORAGE_RETRY_ATTEMPTS} attempts: ${lastError.message}`,
      );
    }
    removed += paths.length;
  }
  throw new DeletionError(
    'storage_purge_failed',
    step,
    `safety limit reached draining ${bucket}; suspected pagination loop`,
  );
};

const purgeBoth = async (client: AdminClient, userId: string) => ({
  audioCount: await purgeBucket(client, AUDIO_BUCKET, userId, 'storage_purge_audio'),
  imageCount: await purgeBucket(client, IMAGES_BUCKET, userId, 'storage_purge_images'),
});

export const deleteAccount = async (
  client: AdminClient,
  userId: string,
): Promise<{ audioCount: number; imageCount: number }> => {
  const first = await purgeBoth(client, userId);

  const { error } = await client.auth.admin.deleteUser(userId);
  if (error) {
    const notFound =
      error.code === 'user_not_found' || error.message.toLowerCase().includes('not found');
    if (!notFound) throw new DeletionError('auth_delete_failed', 'auth_delete', error.message);
  }

  // An upload can land between the first purge and deleteUser; none can
  // land after it, because storage writes need a live user (#639, #659).
  const second = await purgeBoth(client, userId);
  return {
    audioCount: first.audioCount + second.audioCount,
    imageCount: first.imageCount + second.imageCount,
  };
};
