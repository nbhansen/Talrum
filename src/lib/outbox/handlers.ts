import {
  AUDIO_BUCKET,
  IMAGES_BUCKET,
  invalidateSignedUrl,
  removeFromBucket,
  uploadBlob,
} from '@/lib/storage';
import { supabase } from '@/lib/supabase';

import type {
  ClearPictogramAudioEntry,
  CreatePhotoPictogramEntry,
  OutboxEntry,
  SetPictogramAudioEntry,
  UpdateBoardEntry,
} from './types';

/**
 * Thrown by handlers when the failure is permanent (RLS denial, validation,
 * not-found, 4xx). The drain loop converts these to a `failed` status and
 * stops re-trying the entry. Anything else is treated as transient (network,
 * 5xx) and the entry stays pending for the next drain.
 */
export class UnretryableOutboxError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'UnretryableOutboxError';
  }
}

/**
 * Classify an error from a handler call: re-throw the same value if it's
 * already an Unretryable, treat coded Postgres errors and 4xx storage errors
 * as permanent, treat TypeErrors and 5xx as transient.
 */
const classifyAndThrow = (err: unknown): never => {
  if (err instanceof UnretryableOutboxError) throw err;
  if (err instanceof TypeError) throw err; // network failure, retry later
  const message = err instanceof Error ? err.message : String(err);
  if (typeof err === 'object' && err !== null) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') {
      throw new UnretryableOutboxError(`db ${code}: ${message}`, { cause: err });
    }
    const status = (err as { statusCode?: unknown }).statusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      throw new UnretryableOutboxError(`storage ${status}: ${message}`, { cause: err });
    }
  }
  throw err;
};

const handleUpdateBoard = async (entry: UpdateBoardEntry): Promise<void> => {
  try {
    const { error } = await supabase.from('boards').update(entry.patch).eq('id', entry.boardId);
    if (error) throw error;
  } catch (err) {
    classifyAndThrow(err);
  }
};

const handleCreatePhotoPictogram = async (entry: CreatePhotoPictogramEntry): Promise<void> => {
  const path = `${entry.ownerId}/${entry.pictogramId}.${entry.extension}`;
  try {
    await uploadBlob(IMAGES_BUCKET, path, entry.blob);
    invalidateSignedUrl(IMAGES_BUCKET, path);
    const { error } = await supabase.from('pictograms').insert({
      id: entry.pictogramId,
      owner_id: entry.ownerId,
      label: entry.label,
      style: 'photo',
      image_path: path,
    });
    if (error) {
      // Insert failed after upload — clean up the blob so we don't leak.
      await removeFromBucket(IMAGES_BUCKET, [path]).catch(() => undefined);
      throw error;
    }
  } catch (err) {
    classifyAndThrow(err);
  }
};

const handleSetPictogramAudio = async (entry: SetPictogramAudioEntry): Promise<void> => {
  const path = `${entry.ownerId}/${entry.pictogramId}.${entry.extension}`;
  try {
    await uploadBlob(AUDIO_BUCKET, path, entry.blob);
    invalidateSignedUrl(AUDIO_BUCKET, path);
    const { error } = await supabase
      .from('pictograms')
      .update({ audio_path: path })
      .eq('id', entry.pictogramId);
    if (error) throw error;
    if (entry.previousPath && entry.previousPath !== path) {
      await removeFromBucket(AUDIO_BUCKET, [entry.previousPath]).catch(() => undefined);
      invalidateSignedUrl(AUDIO_BUCKET, entry.previousPath);
    }
  } catch (err) {
    classifyAndThrow(err);
  }
};

const handleClearPictogramAudio = async (entry: ClearPictogramAudioEntry): Promise<void> => {
  try {
    await removeFromBucket(AUDIO_BUCKET, [entry.path]).catch(() => undefined);
    invalidateSignedUrl(AUDIO_BUCKET, entry.path);
    const { error } = await supabase
      .from('pictograms')
      .update({ audio_path: null })
      .eq('id', entry.pictogramId);
    if (error) throw error;
  } catch (err) {
    classifyAndThrow(err);
  }
};

export const runHandler = (entry: OutboxEntry): Promise<void> => {
  switch (entry.kind) {
    case 'updateBoard':
      return handleUpdateBoard(entry);
    case 'createPhotoPicto':
      return handleCreatePhotoPictogram(entry);
    case 'setPictoAudio':
      return handleSetPictogramAudio(entry);
    case 'clearPictoAudio':
      return handleClearPictogramAudio(entry);
  }
};
