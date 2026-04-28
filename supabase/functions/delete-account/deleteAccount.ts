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
      ) => Promise<{ data: { name: string }[] | null; error: { message: string } | null }>;
      remove: (
        paths: string[],
      ) => Promise<{ data: { name: string }[] | null; error: { message: string } | null }>;
    };
  };
  auth: {
    admin: {
      deleteUser: (uid: string) => Promise<{ error: { message: string } | null }>;
    };
  };
}

const purgeBucket = async (
  client: AdminClient,
  bucket: string,
  userId: string,
  step: 'storage_purge_audio' | 'storage_purge_images',
): Promise<void> => {
  // Drain the prefix one page at a time until list returns empty.
  for (let safety = 0; safety < 1000; safety++) {
    const { data, error } = await client.storage
      .from(bucket)
      .list(userId, { limit: STORAGE_LIST_LIMIT });
    if (error) {
      throw new DeletionError('storage_purge_failed', step, `list ${bucket}: ${error.message}`);
    }
    if (!data || data.length === 0) return;

    const paths = data.map((o) => `${userId}/${o.name}`);
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
  }
  throw new DeletionError(
    'storage_purge_failed',
    step,
    `safety limit reached draining ${bucket}; suspected pagination loop`,
  );
};

export const deleteAccount = async (client: AdminClient, userId: string): Promise<void> => {
  await purgeBucket(client, AUDIO_BUCKET, userId, 'storage_purge_audio');
  await purgeBucket(client, IMAGES_BUCKET, userId, 'storage_purge_images');

  const { error } = await client.auth.admin.deleteUser(userId);
  if (error) {
    if (error.message.toLowerCase().includes('not found')) return;
    throw new DeletionError('auth_delete_failed', 'auth_delete', error.message);
  }
};
