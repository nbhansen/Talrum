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
 * capacity codes a shared pooler emits under load — too_many_connections
 * (53300) and cannot_connect_now (57P03) — and query_canceled (57014,
 * what PostgREST surfaces when statement_timeout fires; every handler here
 * is a single-row update or RPC, so a timeout means contention, and the
 * cancel rolled the statement back). Postgres documents "retry the
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
  '57014',
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

/**
 * Blob entries persisted before #415 carried an `extension` and derived a
 * deterministic path at run time; new writes no longer own those paths, so
 * replaying such an entry would reopen the late-IO clobber the versioned
 * paths close. Fail it permanently with an instruction instead. The
 * parameter is typed optional because the persisted object may predate the
 * required field.
 */
const entryPath = (entry: { path?: string }): string => {
  if (typeof entry.path === 'string') return entry.path;
  throw new UnretryableOutboxError('entry predates versioned storage paths — discard and redo');
};

/**
 * Which object does this write supersede? Read it from the row, never from a
 * client snapshot (#418 review): `previousPath`-style snapshots came from the
 * optimistically patched cache, which holds a `blob:` URL between an enqueue
 * and the settle refetch — a second mutation in that window snapshots the
 * blob URL, the cleanup matches nothing, and the superseded versioned object
 * (#415) is orphaned permanently. The row read is also exactly right for
 * offline chains: FIFO replay means each entry sees the path its predecessor
 * landed. `maybeSingle`: a row deleted mid-queue yields null and the caller
 * skips cleanup — the same silent-success semantics as the update after it.
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
  // Insert failed after upload: leave the blob in place — never delete it
  // (#414 review). A rollback here is the one step that undoes another run's
  // work, and a run abandoned by the handler timeout (#413) can execute it
  // concurrently with its own retry: the zombie's delete lands after the
  // retry re-uploaded and inserted, leaving a pictogram row whose image_path
  // points at nothing, permanently. A transient failure re-uploads on retry
  // anyway (storage upsert), and a permanent one leaks at most one orphaned
  // object per failed create — strictly cheaper than a dangling image.
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
  // `previous === path` on a replay of an entry whose update already landed.
  // That guard also means the remove is not replay-idempotent: a crash
  // between the update and this remove skips it on replay (the read hands
  // back our own path, the superseded one is gone from the row) and the old
  // object stays as an orphan — a named residual in docs/outbox.md.
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
  // The gate that motivated throwIfCancelled: if the read above hung past
  // the timeout, the row update below would land after a later setPictoAudio
  // and null out the audio_path it just set.
  throwIfCancelled(signal);
  const { error } = await supabase
    .from('pictograms')
    .update({ audio_path: null })
    .eq('id', entry.pictogramId);
  if (error) throw error;
  throwIfCancelled(signal);
  // Remove after the row stops referencing the object, so a failure between
  // the two leaves a dangling object (retry converges) rather than a row
  // pointing at nothing.
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
  // The boards scrub + row delete run server-side in the `delete_pictogram`
  // RPC, one transaction, with the referencing boards recomputed at execution
  // time (#280) — no stale client-cache scrub list. The paths come from the
  // row for the same reason (#418 review, see readRowPaths). Storage cleanup
  // runs *before* the RPC so a transient storage failure throws and the
  // outbox retries the whole entry. Each step is idempotent on retry: the
  // read yields null once the row is gone, the storage removes return
  // success on missing keys, and the RPC is a no-op.
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
 * Upper bound on one handler run (#413). `fetch` has no default timeout, so
 * a socket stuck open with no bytes (mobile radio in limbo, `navigator.onLine`
 * still true) would otherwise pend forever — and the fast path and drain run
 * handlers under the cross-tab web lock (#395), which only auto-releases when
 * the tab dies, so one hung request would freeze every tab's writes. A
 * single-row write that hasn't settled in 30 s is hung, not slow.
 */
export const HANDLER_TIMEOUT_MS = 30_000;

/**
 * Blob-carrying kinds get a longer bound: the timeout is wall-clock and the
 * retry restarts the transfer from byte zero, so a bound below the largest
 * legitimate transfer converts "slow" into six doomed attempts and a
 * permanent `failed` (#414 review). The payloads are bounded by
 * construction: photos are re-encoded to 512px JPEG (~100 KB,
 * `src/lib/image.ts`) and recordings are capped at `MAX_RECORDING_MS`
 * (#416, `src/lib/platform/recording.ts` — change the cap and this bound together),
 * so the worst clip is a few hundred KB, well inside 120 s on any usable
 * uplink. The headroom is for the slowest real uplinks; the bound's job is
 * hang detection.
 */
export const BLOB_HANDLER_TIMEOUT_MS = 120_000;

const handlerTimeoutMs = (entry: OutboxEntry): number =>
  'blob' in entry ? BLOB_HANDLER_TIMEOUT_MS : HANDLER_TIMEOUT_MS;

/**
 * A race, not an abort: PostgREST builders accept `abortSignal`, but
 * storage-js `upload`/`remove` (v2.106) do not, and the blob upload is the
 * longest-running IO here — an abort-based bound would miss it. The losing
 * run keeps going after the timeout and can land concurrently with its own
 * retry, so two rules keep that safe:
 *
 * 1. Every handler converges under replay (docs/outbox.md, "Rules for
 *    writing a handler"), and no handler rolls back storage side effects on
 *    failure (see `handleCreatePhotoPictogram`).
 * 2. An abandoned run starts no further side-effecting steps: the timeout
 *    aborts the signal handed to `dispatch`, and multi-step handlers check
 *    it between steps. Without the check, a zombie `clearPictoAudio` whose
 *    hung storage remove finally settles would continue into its row update
 *    and null out an `audio_path` a later entry just set.
 *
 * Residual, documented in docs/outbox.md "Known limits": a request already
 * in flight when the timer fires can still land arbitrarily late. For row
 * writes that is the last-write-wins class the app already accepts for
 * cross-device replays (boards stay safe via the conflict guard, #281). For
 * storage objects, versioned paths (#415, `mintStoragePath`) make the late
 * request land on a path no newer write owns — at worst one orphaned
 * object, never a newer upload.
 *
 * A late rejection from the losing run is not an unhandled rejection: the
 * race subscribed to it when it started.
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
 * Between-step guard for multi-step handlers: after the timeout has
 * abandoned this run, starting the next step could undo work a causally
 * later entry has done since. The throw lands in the zombie run, which
 * nobody observes — that is the point.
 */
const throwIfCancelled = (signal: AbortSignal): void => {
  if (signal.aborted) throw new Error('handler run abandoned by its timeout');
};

export const runHandler = async (entry: OutboxEntry): Promise<void> => {
  try {
    // The timeout error is a plain Error: no code, no statusCode, not a
    // TypeError — classifyAndThrow rethrows it as-is, so the drain treats it
    // as transient and the retry schedule (#391) takes over.
    await withHandlerTimeout((signal) => dispatch(entry, signal), handlerTimeoutMs(entry));
  } catch (err) {
    classifyAndThrow(err);
  }
};
