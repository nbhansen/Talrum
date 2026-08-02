import {
  AUDIO_BUCKET,
  IMAGES_BUCKET,
  invalidateSignedUrl,
  isUploadedStoragePath,
  removeFromBucket,
  uploadBlob,
} from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { captureException } from '@/lib/telemetry';

import { noteBoardUpdatedAt, resolveExpectedUpdatedAt } from './board-clock';
import type {
  ClearPictogramAudioEntry,
  CreatePhotoPictogramEntry,
  DeleteKidEntry,
  DeletePictogramEntry,
  OutboxEntry,
  OutboxFailureKind,
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
  /** Persisted onto the failed entry by the drain loop (#392). */
  readonly failureKind: OutboxFailureKind;

  constructor(message: string, options?: { cause?: unknown; failureKind?: OutboxFailureKind }) {
    super(message, options);
    this.name = 'UnretryableOutboxError';
    this.failureKind = options?.failureKind ?? 'permanent';
  }
}

/**
 * Postgres codes that signal a retryable coordination failure, not a bad
 * request: serialization failure (40001), deadlock detected (40P01), the
 * connection-exception codes (08xxx, minus 08P01 protocol_violation — that
 * one is a malformed request and retrying it cannot succeed), plus the two
 * capacity codes a shared pooler emits under load: too_many_connections
 * (53300) and cannot_connect_now (57P03). Postgres documents "retry the
 * transaction" as the remedy for the listed codes, so they must stay
 * transient instead of falling through to the blanket
 * coded-error-is-permanent rule below (#394).
 *
 * Accepted tradeoff: a connection error can arrive after the server already
 * committed. A replay of a guarded `updateBoard` then trips the conflict
 * guard and shows the conflict pill for this device's own write. That is
 * safe — Retry strips the guard and re-applies the identical patch — and
 * rarer than the real failure this list fixes: a dropped connection flipping
 * a good write to `failed` with no retry at all.
 */
const TRANSIENT_DB_CODES = new Set([
  '40001',
  '40P01',
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
  '08007',
  '53300',
  '57P03',
]);
const isTransientDbCode = (code: string): boolean => TRANSIENT_DB_CODES.has(code);

/**
 * Classify an error from a handler call: re-throw the same value if it's
 * already an Unretryable, treat coded Postgres errors and 4xx storage errors
 * as permanent, treat TypeErrors, retryable Postgres codes, and 5xx as
 * transient.
 */
const classifyAndThrow = (err: unknown): never => {
  if (err instanceof UnretryableOutboxError) throw err;
  if (err instanceof TypeError) throw err; // network failure, retry later
  // Covers Error instances and plain `{code, message}` objects alike —
  // supabase-js can hand back either shape.
  const rawMessage = (err as { message?: unknown } | null)?.message;
  const message = typeof rawMessage === 'string' ? rawMessage : String(err);
  if (typeof err === 'object' && err !== null) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') {
      if (isTransientDbCode(code)) {
        // Wrap in a plain Error (not Unretryable, so the entry stays
        // pending): the drain persists `err.message` as `lastError`, and a
        // raw rethrow would drop the SQLSTATE — or record 'unknown error'
        // when the value is a plain object rather than an Error.
        throw new Error(`db ${code}: ${message}`, { cause: err });
      }
      throw new UnretryableOutboxError(`db ${code}: ${message}`, { cause: err });
    }
    const status = (err as { statusCode?: unknown }).statusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      throw new UnretryableOutboxError(`storage ${status}: ${message}`, { cause: err });
    }
  }
  throw err;
};

/**
 * Storage-cleanup removals (old recordings, orphaned upload blobs) are
 * best-effort: a leaked object is better than failing the user's write, so we
 * don't propagate the error. But we report it to telemetry so the leak is
 * observable rather than silent — see #255's silent-fallback seam.
 */
const reportCleanupFailure = (err: unknown): void => {
  captureException(err, {
    level: 'warning',
    tags: { component: 'outbox', op: 'storage-cleanup' },
  });
};

/**
 * `lastError` copy for an entry that failed the optimistic-concurrency check
 * below. Display only — conflict *behavior* (`conflictCount`, the Retry
 * guard-strip) keys off `failureKind: 'conflict'`, never this string (#392).
 */
export const BOARD_CONFLICT_MESSAGE = "couldn't sync — board changed on another device";

const handleUpdateBoard = async (entry: UpdateBoardEntry): Promise<void> => {
  const expected = resolveExpectedUpdatedAt(entry.boardId, entry.expectedUpdatedAt);
  if (expected === undefined) {
    // Unguarded last-write-wins: pre-#281 persisted entries, conflict
    // retries with the guard stripped, and edits made before the board
    // query delivered a baseline. Zero rows back stays a silent success
    // (board already deleted/hidden — pre-#281 semantics). The clock note
    // is not optional: an unguarded replay bumps the server's updated_at
    // like any write, and queued guarded entries for the same board must
    // not self-conflict against it.
    const { data, error } = await supabase
      .from('boards')
      .update(entry.patch)
      .eq('id', entry.boardId)
      .select('updated_at');
    if (error) throw error;
    const row = data?.[0];
    if (row !== undefined) noteBoardUpdatedAt(entry.boardId, row.updated_at);
    return;
  }
  // Conditional update (#281): zero rows back means `updated_at` moved —
  // another device wrote the board since this entry's baseline. Permanent
  // failure, so the indicator offers Retry (overwrite) / Discard instead of
  // silently clobbering the other side. The returned `updated_at` feeds the
  // board clock so this device's own queued edits don't trip the guard.
  const { data, error } = await supabase
    .from('boards')
    .update(entry.patch)
    .match({ id: entry.boardId, updated_at: expected })
    .select('updated_at');
  if (error) throw error;
  const row = data?.[0];
  if (row === undefined) {
    throw new UnretryableOutboxError(BOARD_CONFLICT_MESSAGE, { failureKind: 'conflict' });
  }
  noteBoardUpdatedAt(entry.boardId, row.updated_at);
};

const handleCreatePhotoPictogram = async (entry: CreatePhotoPictogramEntry): Promise<void> => {
  const path = `${entry.ownerId}/${entry.pictogramId}.${entry.extension}`;
  await uploadBlob(IMAGES_BUCKET, path, entry.blob);
  invalidateSignedUrl(IMAGES_BUCKET, path);
  // `ignoreDuplicates` maps to ON CONFLICT DO NOTHING on the primary key.
  // A same-tab replay after a crash mid-entry can find the row already
  // inserted (the id is client-minted, so a duplicate can only be our own
  // earlier attempt); a plain insert would raise 23505, which
  // `classifyAndThrow` marks permanent, and flip a succeeded create to
  // failed (#393). DO NOTHING also leaves any later edits to the row alone.
  const { error } = await supabase.from('pictograms').upsert(
    {
      id: entry.pictogramId,
      owner_id: entry.ownerId,
      label: entry.label,
      style: 'photo',
      image_path: path,
    },
    { ignoreDuplicates: true },
  );
  if (error) {
    // Insert failed after upload — clean up the blob so we don't leak.
    await removeFromBucket(IMAGES_BUCKET, [path]).catch(reportCleanupFailure);
    throw error;
  }
};

const handleSetPictogramAudio = async (entry: SetPictogramAudioEntry): Promise<void> => {
  const path = `${entry.ownerId}/${entry.pictogramId}.${entry.extension}`;
  await uploadBlob(AUDIO_BUCKET, path, entry.blob);
  invalidateSignedUrl(AUDIO_BUCKET, path);
  const { error } = await supabase
    .from('pictograms')
    .update({ audio_path: path })
    .eq('id', entry.pictogramId);
  if (error) throw error;
  if (entry.previousPath && entry.previousPath !== path) {
    await removeFromBucket(AUDIO_BUCKET, [entry.previousPath]).catch(reportCleanupFailure);
    invalidateSignedUrl(AUDIO_BUCKET, entry.previousPath);
  }
};

const handleClearPictogramAudio = async (entry: ClearPictogramAudioEntry): Promise<void> => {
  await removeFromBucket(AUDIO_BUCKET, [entry.path]).catch(reportCleanupFailure);
  invalidateSignedUrl(AUDIO_BUCKET, entry.path);
  const { error } = await supabase
    .from('pictograms')
    .update({ audio_path: null })
    .eq('id', entry.pictogramId);
  if (error) throw error;
};

const handleRenamePictogram = async (entry: RenamePictogramEntry): Promise<void> => {
  const { error } = await supabase
    .from('pictograms')
    .update({ label: entry.label })
    .eq('id', entry.pictogramId);
  if (error) throw error;
};

const handleReplacePictogramImage = async (entry: ReplacePictogramImageEntry): Promise<void> => {
  const path = `${entry.ownerId}/${entry.pictogramId}.${entry.extension}`;
  await uploadBlob(IMAGES_BUCKET, path, entry.blob);
  invalidateSignedUrl(IMAGES_BUCKET, path);
  const { error } = await supabase
    .from('pictograms')
    .update({ image_path: path })
    .eq('id', entry.pictogramId);
  if (error) throw error;
  if (isUploadedStoragePath(entry.previousPath) && entry.previousPath !== path) {
    await removeFromBucket(IMAGES_BUCKET, [entry.previousPath]).catch(reportCleanupFailure);
    invalidateSignedUrl(IMAGES_BUCKET, entry.previousPath);
  }
};

const handleDeletePictogram = async (entry: DeletePictogramEntry): Promise<void> => {
  // The boards scrub + row delete run server-side in the `delete_pictogram`
  // RPC, one transaction, with the referencing boards recomputed at execution
  // time (#280) — no stale client-cache scrub list. Storage cleanup runs
  // *before* the RPC so a transient storage failure throws and the outbox
  // retries the whole entry. Each step is idempotent on retry: the storage
  // removes return success on missing keys, and the RPC is a no-op once the
  // row is gone.
  if (isUploadedStoragePath(entry.previousImagePath)) {
    await removeFromBucket(IMAGES_BUCKET, [entry.previousImagePath]);
    invalidateSignedUrl(IMAGES_BUCKET, entry.previousImagePath);
  }
  if (isUploadedStoragePath(entry.previousAudioPath)) {
    await removeFromBucket(AUDIO_BUCKET, [entry.previousAudioPath]);
    invalidateSignedUrl(AUDIO_BUCKET, entry.previousAudioPath);
  }
  const { error } = await supabase.rpc('delete_pictogram', {
    p_pictogram_id: entry.pictogramId,
  });
  if (error) throw error;
};

const handleRenameKid = async (entry: RenameKidEntry): Promise<void> => {
  const { error } = await supabase.from('kids').update({ name: entry.name }).eq('id', entry.kidId);
  if (error) throw error;
};

const handleDeleteKid = async (entry: DeleteKidEntry): Promise<void> => {
  // boards.kid_id ON DELETE CASCADE handles board cleanup server-side.
  // Pictograms are owner-scoped (not kid-scoped), so they survive — correct
  // since they're shared across the owner's kids' boards.
  const { error } = await supabase.from('kids').delete().eq('id', entry.kidId);
  if (error) throw error;
};

/**
 * Routes an entry to its handler. Handlers carry only their happy path; all
 * error classification is owned by `runHandler` so a new handler can't forget
 * the wrapper and silently let raw errors through as retry-forever transients.
 */
const dispatch = (entry: OutboxEntry): Promise<void> => {
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

export const runHandler = async (entry: OutboxEntry): Promise<void> => {
  try {
    await dispatch(entry);
  } catch (err) {
    classifyAndThrow(err);
  }
};
