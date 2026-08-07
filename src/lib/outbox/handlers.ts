import { captureException } from '@/lib/platform/telemetry';
import {
  AUDIO_BUCKET,
  IMAGES_BUCKET,
  invalidateSignedUrl,
  isUploadedStoragePath,
  removeFromBucket,
  uploadBlob,
} from '@/lib/storage';
import { supabase } from '@/lib/supabase';

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
 * Permanent failure (RLS denial, validation, not-found, 4xx). The drain marks
 * these `failed` and stops. Anything else is transient and stays pending.
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
 * Coordination failures, not bad requests: Postgres documents "retry the
 * transaction" for these, so they must not fall through to the blanket
 * coded-error-is-permanent rule below (#394). The 08xxx family is included
 * except 08P01, a malformed request that cannot succeed on retry.
 */
const TRANSIENT_DB_CODES = new Set([
  '40001', // serialization_failure
  '40P01', // deadlock_detected
  '08000', // connection_exception
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08003', // connection_does_not_exist
  '08004', // sqlserver_rejected_establishment_of_sqlconnection
  '08006', // connection_failure
  '08007', // transaction_resolution_unknown
  '53300', // too_many_connections — a shared pooler under load
  '57P03', // cannot_connect_now
  '57014', // query_canceled — statement_timeout, so contention; it rolled back
]);
const isTransientDbCode = (code: string): boolean => TRANSIENT_DB_CODES.has(code);

const classifyAndThrow = (err: unknown): never => {
  if (err instanceof UnretryableOutboxError) throw err;
  if (err instanceof TypeError) throw err; // network failure, retry later
  // supabase-js hands back Error instances and plain `{code, message}` alike.
  const rawMessage = (err as { message?: unknown } | null)?.message;
  const message = typeof rawMessage === 'string' ? rawMessage : String(err);
  if (typeof err === 'object' && err !== null) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') {
      if (isTransientDbCode(code)) {
        // A raw rethrow would drop the SQLSTATE from `lastError`, or record
        // 'unknown error' when the value is a plain object, not an Error.
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
 * A leaked object beats failing the user's write, so cleanup removals swallow
 * their error — but report it, so the leak is observable rather than silent.
 */
const reportCleanupFailure = (err: unknown): void => {
  captureException(err, {
    level: 'warning',
    tags: { component: 'outbox', op: 'storage-cleanup' },
  });
};

/** Display only. Conflict behaviour keys off `failureKind`, never this (#392). */
export const BOARD_CONFLICT_MESSAGE = "couldn't sync — board changed on another device";

const handleUpdateBoard = async (entry: UpdateBoardEntry): Promise<void> => {
  const expected = resolveExpectedUpdatedAt(entry.boardId, entry.expectedUpdatedAt);
  if (expected === undefined) {
    // Unguarded last-write-wins, and zero rows stays a silent success. The
    // clock note is not optional: an unguarded replay bumps `updated_at` like
    // any write, and queued guarded entries must not self-conflict with it.
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
  // Zero rows means `updated_at` moved, so another device wrote the board
  // since this baseline. Fail permanently and offer Retry or Discard rather
  // than clobber the other side (#281).
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

/**
 * Entries persisted before #415 derived a deterministic path at run time.
 * Replaying one reopens the late-IO clobber that versioned paths close, so it
 * fails permanently instead. Typed optional because the object predates it.
 */
const entryPath = (entry: { path?: string }): string => {
  if (typeof entry.path === 'string') return entry.path;
  throw new UnretryableOutboxError('entry predates versioned storage paths — discard and redo');
};

/**
 * Which object this write supersedes, read from the row and never from a
 * client snapshot: the optimistic cache holds a `blob:` URL between enqueue
 * and refetch, so a snapshot orphans the superseded object (#418). FIFO replay
 * makes the row read right for offline chains too.
 */
const readRowPaths = async (
  pictogramId: string,
): Promise<{ image_path: string | null; audio_path: string | null } | null> => {
  const { data, error } = await supabase
    .from('pictograms')
    .select('image_path, audio_path')
    .eq('id', pictogramId)
    .maybeSingle();
  if (error) throw error;
  return data;
};

const handleCreatePhotoPictogram = async (
  entry: CreatePhotoPictogramEntry,
  signal: AbortSignal,
): Promise<void> => {
  const path = entryPath(entry);
  await uploadBlob(IMAGES_BUCKET, path, entry.blob);
  throwIfCancelled(signal);
  invalidateSignedUrl(IMAGES_BUCKET, path);
  // ON CONFLICT DO NOTHING. The id is client-minted, so a duplicate can only
  // be our own earlier attempt; a plain insert would raise 23505 and flip a
  // succeeded create to failed (#393). It also leaves later edits alone.
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
  // Never delete the blob after a failed insert (#414). That rollback is the
  // one step that undoes another run's work: a run abandoned by the timeout
  // (#413) can delete after its own retry re-uploaded, leaving a row whose
  // image_path points at nothing. An orphan is cheaper than a dangling image.
  if (error) throw error;
};

const handleSetPictogramAudio = async (
  entry: SetPictogramAudioEntry,
  signal: AbortSignal,
): Promise<void> => {
  const path = entryPath(entry);
  await uploadBlob(AUDIO_BUCKET, path, entry.blob);
  throwIfCancelled(signal);
  invalidateSignedUrl(AUDIO_BUCKET, path);
  // Read before the update — afterwards the row already points at `path`.
  const previous = (await readRowPaths(entry.pictogramId))?.audio_path ?? undefined;
  throwIfCancelled(signal);
  const { error } = await supabase
    .from('pictograms')
    .update({ audio_path: path })
    .eq('id', entry.pictogramId);
  if (error) throw error;
  throwIfCancelled(signal);
  // `previous === path` on a replay whose update already landed. So the remove
  // is not replay-idempotent: a crash between the two orphans the old object,
  // a named residual in docs/outbox.md.
  if (isUploadedStoragePath(previous) && previous !== path) {
    await removeFromBucket(AUDIO_BUCKET, [previous]).catch(reportCleanupFailure);
    invalidateSignedUrl(AUDIO_BUCKET, previous);
  }
};

const handleClearPictogramAudio = async (
  entry: ClearPictogramAudioEntry,
  signal: AbortSignal,
): Promise<void> => {
  const previous = (await readRowPaths(entry.pictogramId))?.audio_path ?? undefined;
  // If the read above hung past the timeout, the update below would land after
  // a later setPictoAudio and null out the audio_path it just set.
  throwIfCancelled(signal);
  const { error } = await supabase
    .from('pictograms')
    .update({ audio_path: null })
    .eq('id', entry.pictogramId);
  if (error) throw error;
  throwIfCancelled(signal);
  // Remove after the row stops referencing the object: a failure between the
  // two then leaves an orphan, not a row pointing at nothing.
  if (isUploadedStoragePath(previous)) {
    await removeFromBucket(AUDIO_BUCKET, [previous]).catch(reportCleanupFailure);
    invalidateSignedUrl(AUDIO_BUCKET, previous);
  }
};

const handleRenamePictogram = async (entry: RenamePictogramEntry): Promise<void> => {
  const { error } = await supabase
    .from('pictograms')
    .update({ label: entry.label })
    .eq('id', entry.pictogramId);
  if (error) throw error;
};

const handleReplacePictogramImage = async (
  entry: ReplacePictogramImageEntry,
  signal: AbortSignal,
): Promise<void> => {
  const path = entryPath(entry);
  await uploadBlob(IMAGES_BUCKET, path, entry.blob);
  throwIfCancelled(signal);
  invalidateSignedUrl(IMAGES_BUCKET, path);
  // Read before the update — afterwards the row already points at `path`.
  const previous = (await readRowPaths(entry.pictogramId))?.image_path ?? undefined;
  throwIfCancelled(signal);
  const { error } = await supabase
    .from('pictograms')
    .update({ image_path: path })
    .eq('id', entry.pictogramId);
  if (error) throw error;
  throwIfCancelled(signal);
  // isUploadedStoragePath skips stock-prefixed seeds; `previous === path` on
  // a replay of an entry whose update already landed.
  if (isUploadedStoragePath(previous) && previous !== path) {
    await removeFromBucket(IMAGES_BUCKET, [previous]).catch(reportCleanupFailure);
    invalidateSignedUrl(IMAGES_BUCKET, previous);
  }
};

const handleDeletePictogram = async (
  entry: DeletePictogramEntry,
  signal: AbortSignal,
): Promise<void> => {
  // The boards scrub and the row delete run in one server-side transaction,
  // with the referencing boards recomputed at execution time (#280). Storage
  // cleanup runs first so a transient storage failure retries the whole entry.
  const row = await readRowPaths(entry.pictogramId);
  throwIfCancelled(signal);
  const imagePath = row?.image_path ?? undefined;
  if (isUploadedStoragePath(imagePath)) {
    await removeFromBucket(IMAGES_BUCKET, [imagePath]);
    throwIfCancelled(signal);
    invalidateSignedUrl(IMAGES_BUCKET, imagePath);
  }
  const audioPath = row?.audio_path ?? undefined;
  if (isUploadedStoragePath(audioPath)) {
    await removeFromBucket(AUDIO_BUCKET, [audioPath]);
    throwIfCancelled(signal);
    invalidateSignedUrl(AUDIO_BUCKET, audioPath);
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
  // Boards cascade server-side. Pictograms are owner-scoped, so they survive —
  // correct, because they are shared across the owner's kids' boards.
  const { error } = await supabase.from('kids').delete().eq('id', entry.kidId);
  if (error) throw error;
};

/**
 * Handlers carry only their happy path. Classification lives here so a new
 * handler cannot forget the wrapper and leak retry-forever transients.
 */
const dispatch = (entry: OutboxEntry, signal: AbortSignal): Promise<void> => {
  switch (entry.kind) {
    case 'updateBoard':
      return handleUpdateBoard(entry);
    case 'createPhotoPicto':
      return handleCreatePhotoPictogram(entry, signal);
    case 'setPictoAudio':
      return handleSetPictogramAudio(entry, signal);
    case 'clearPictoAudio':
      return handleClearPictogramAudio(entry, signal);
    case 'renamePicto':
      return handleRenamePictogram(entry);
    case 'replacePictoImage':
      return handleReplacePictogramImage(entry, signal);
    case 'deletePicto':
      return handleDeletePictogram(entry, signal);
    case 'renameKid':
      return handleRenameKid(entry);
    case 'deleteKid':
      return handleDeleteKid(entry);
  }
};

/**
 * `fetch` has no default timeout, and handlers run under the cross-tab lock,
 * so one socket stuck open would freeze every tab's writes (#413). A
 * single-row write that has not settled in 30 s is hung, not slow.
 */
export const HANDLER_TIMEOUT_MS = 30_000;

/**
 * The timeout is wall-clock and a retry restarts the transfer from byte zero,
 * so a bound below the largest legitimate upload turns "slow" into six doomed
 * attempts (#414). Payloads are bounded by `src/lib/image.ts` and
 * `MAX_RECORDING_MS` — change that cap and this bound together.
 */
export const BLOB_HANDLER_TIMEOUT_MS = 120_000;

const handlerTimeoutMs = (entry: OutboxEntry): number =>
  'blob' in entry ? BLOB_HANDLER_TIMEOUT_MS : HANDLER_TIMEOUT_MS;

/**
 * A race, not an abort: storage-js `upload`/`remove` (v2.106) take no
 * `abortSignal`, and the blob upload is the longest IO here. The losing run
 * keeps going, which is safe because handlers converge under replay and start
 * no further steps once cancelled. Residual in docs/outbox.md, "Known limits".
 */
const withHandlerTimeout = async (
  start: (signal: AbortSignal) => Promise<void>,
  ms: number,
): Promise<void> => {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`handler timed out after ${ms / 1000}s`));
    }, ms);
  });
  try {
    await Promise.race([start(controller.signal), timedOut]);
  } finally {
    clearTimeout(timer);
  }
};

/**
 * After the timeout abandons a run, its next step could undo work a causally
 * later entry has done since. The throw lands in the zombie, unobserved.
 */
const throwIfCancelled = (signal: AbortSignal): void => {
  if (signal.aborted) throw new Error('handler run abandoned by its timeout');
};

export const runHandler = async (entry: OutboxEntry): Promise<void> => {
  try {
    // A plain Error, so classifyAndThrow rethrows it as-is and the drain
    // treats it as transient (#391).
    await withHandlerTimeout((signal) => dispatch(entry, signal), handlerTimeoutMs(entry));
  } catch (err) {
    classifyAndThrow(err);
  }
};
