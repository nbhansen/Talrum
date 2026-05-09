import {
  AUDIO_BUCKET,
  IMAGES_BUCKET,
  invalidateSignedUrl,
  isUploadedStoragePath,
  removeFromBucket,
  uploadBlob,
} from '@/lib/storage';
import { supabase } from '@/lib/supabase';

import type {
  ClearPictogramAudioEntry,
  CreatePhotoPictogramEntry,
  DeleteKidEntry,
  DeletePictogramEntry,
  OutboxEntry,
  RenameKidEntry,
  RenamePictogramEntry,
  ReplacePictogramImageEntry,
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

const handleRenamePictogram = async (entry: RenamePictogramEntry): Promise<void> => {
  try {
    const { error } = await supabase
      .from('pictograms')
      .update({ label: entry.label })
      .eq('id', entry.pictogramId);
    if (error) throw error;
  } catch (err) {
    classifyAndThrow(err);
  }
};

const handleReplacePictogramImage = async (entry: ReplacePictogramImageEntry): Promise<void> => {
  const path = `${entry.ownerId}/${entry.pictogramId}.${entry.extension}`;
  try {
    await uploadBlob(IMAGES_BUCKET, path, entry.blob);
    invalidateSignedUrl(IMAGES_BUCKET, path);
    const { error } = await supabase
      .from('pictograms')
      .update({ image_path: path })
      .eq('id', entry.pictogramId);
    if (error) throw error;
    if (isUploadedStoragePath(entry.previousPath) && entry.previousPath !== path) {
      await removeFromBucket(IMAGES_BUCKET, [entry.previousPath]).catch(() => undefined);
      invalidateSignedUrl(IMAGES_BUCKET, entry.previousPath);
    }
  } catch (err) {
    classifyAndThrow(err);
  }
};

const handleDeletePictogram = async (entry: DeletePictogramEntry): Promise<void> => {
  try {
    // Order matters: scrub boards' step_ids → clean up storage → delete the
    // pictograms row last. step_ids is a uuid[] with no FK, so we have to
    // strip references manually before the row goes away (otherwise boards
    // that referenced it keep dangling UUIDs). Storage cleanup runs *before*
    // the row delete so a transient storage failure throws and the outbox
    // retries the whole entry — once the row is gone, a retry can't re-derive
    // which keys to remove. Each step is idempotent on retry: the SELECT
    // re-reads current step_ids, the UPDATEs are no-ops where already
    // scrubbed, the storage removes return success on missing keys, and the
    // final DELETE returns no error if the row is already gone.
    //
    // The boards scrub takes one SELECT plus N sequential UPDATE calls (one
    // per actually-referencing board); idempotent so retries are safe.
    if (entry.scrubFromBoardIds.length > 0) {
      const { data: rows, error: readErr } = await supabase
        .from('boards')
        .select('id, step_ids')
        .in('id', entry.scrubFromBoardIds);
      if (readErr) throw readErr;
      for (const row of rows ?? []) {
        const next = row.step_ids.filter((id: string) => id !== entry.pictogramId);
        if (next.length === row.step_ids.length) continue;
        const { error: updErr } = await supabase
          .from('boards')
          .update({ step_ids: next })
          .eq('id', row.id);
        if (updErr) throw updErr;
      }
    }
    if (isUploadedStoragePath(entry.previousImagePath)) {
      await removeFromBucket(IMAGES_BUCKET, [entry.previousImagePath]);
      invalidateSignedUrl(IMAGES_BUCKET, entry.previousImagePath);
    }
    if (isUploadedStoragePath(entry.previousAudioPath)) {
      await removeFromBucket(AUDIO_BUCKET, [entry.previousAudioPath]);
      invalidateSignedUrl(AUDIO_BUCKET, entry.previousAudioPath);
    }
    const { error } = await supabase.from('pictograms').delete().eq('id', entry.pictogramId);
    if (error) throw error;
  } catch (err) {
    classifyAndThrow(err);
  }
};

const handleRenameKid = async (entry: RenameKidEntry): Promise<void> => {
  try {
    const { error } = await supabase
      .from('kids')
      .update({ name: entry.name })
      .eq('id', entry.kidId);
    if (error) throw error;
  } catch (err) {
    classifyAndThrow(err);
  }
};

const handleDeleteKid = async (entry: DeleteKidEntry): Promise<void> => {
  try {
    // boards.kid_id ON DELETE CASCADE handles board cleanup server-side.
    // Pictograms are owner-scoped (not kid-scoped), so they survive — correct
    // since they're shared across the owner's kids' boards.
    const { error } = await supabase.from('kids').delete().eq('id', entry.kidId);
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
    case 'renamePicto':
      return handleRenamePictogram(entry);
    case 'replacePictoImage':
      return handleReplacePictogramImage(entry);
    case 'deletePicto':
      return handleDeletePictogram(entry);
    case 'renameKid':
      return handleRenameKid(entry);
    case 'deleteKid':
      return handleDeleteKid(entry);
  }
};
