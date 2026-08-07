import type { BoardKind, VoiceMode } from '@/types/domain';
import type { Database } from '@/types/supabase';

type BoardUpdate = Database['public']['Tables']['boards']['Update'];

/**
 * Patch shape for a board UPDATE. Field names and shapes are derived from the
 * generated `boards` Update type so a schema change can't leave this stale —
 * the handler passes it straight to `supabase.from('boards').update(patch)`.
 *
 * `kind` and `voice_mode` are re-narrowed to their domain unions: the columns
 * are plain `text` (generated as `string`), but DB CHECK constraints plus the
 * camelCase→snake_case mappers in `boards.mutations.ts` guarantee only the
 * union members ever flow through. Keeping the narrow types here stops a
 * caller from queueing an arbitrary string.
 */
export type BoardRowPatch = Pick<
  BoardUpdate,
  'name' | 'labels_visible' | 'step_ids' | 'kid_reorderable'
> & {
  kind?: BoardKind;
  voice_mode?: VoiceMode;
};

/**
 * `pending` — waiting for a drain to replay it. This is the only status the
 * pending count, the drain loop, and the fast-path precondition act on.
 *
 * `attempting` — a handler is running against it right now, under the
 * cross-tab lock. It exists so a write survives the page going away
 * mid-handler (#445) without being mistaken for work waiting to be done:
 * counting it would show a pending write that is not waiting, and replaying
 * it would double-run the handler already in flight.
 *
 * Because the lock is held for the whole attempt and the browser releases it
 * when a tab dies, an `attempting` entry seen from *inside* the lock is
 * proof its owner is gone. `reconcileQueue` promotes those to `pending`
 * (drain.ts) — exact, not a timeout.
 *
 * `failed` — out of retries or permanently rejected. The indicator's Retry
 * and Discard act on these.
 */
export type OutboxEntryStatus = 'pending' | 'attempting' | 'failed';

/**
 * Why a `failed` entry failed. `conflict` means the board conflict guard
 * tripped (#281); everything else that lands in `failed` is `permanent`.
 * This is program state — `conflictCount` and the Retry guard-strip key off
 * it. `lastError` is display copy and must never be compared against (#392).
 */
export type OutboxFailureKind = 'conflict' | 'permanent';

interface OutboxEntryBase {
  /** ULID — monotonically sortable, stable across reloads. */
  id: string;
  /**
   * The signed-in user who enqueued this write. `reconcileQueue` (drain.ts)
   * drops entries enqueued by anybody but the current session, so a write
   * that outlives sign-out on a shared device is never replayed under the
   * next account (#446 review).
   *
   * Deliberately not named `ownerId`: `CreatePhotoPictogramEntry.ownerId` is
   * a *payload* field, written to the row as `owner_id` and used to mint the
   * storage path. One name for both would let this queue-level stamp
   * overwrite the payload through a spread.
   *
   * Optional only for entries written before the stamp existed: a missing
   * value is unattributed, not foreign, and is kept rather than deleted.
   */
  enqueuedBy?: string;
  enqueuedAt: number;
  attemptCount: number;
  status: OutboxEntryStatus;
  /** Last error message, surfaced in the indicator's failed-pill. Display only. */
  lastError?: string;
  /** Set whenever `status` is `failed`. See {@link OutboxFailureKind}. */
  failureKind?: OutboxFailureKind;
}

export interface UpdateBoardEntry extends OutboxEntryBase {
  kind: 'updateBoard';
  boardId: string;
  patch: BoardRowPatch;
  /**
   * Server `updated_at` the patch was computed against. When present the
   * handler updates conditionally and a zero-row result means another device
   * wrote the board since — surfaced as a failed entry instead of a silent
   * overwrite (#281). Absent on entries persisted before the guard existed
   * and when the board cache had no baseline; those replay as plain
   * last-write-wins, and `retryFailed` strips it to make Retry-after-conflict
   * an explicit overwrite.
   */
  expectedUpdatedAt?: string;
}

export interface CreatePhotoPictogramEntry extends OutboxEntryBase {
  kind: 'createPhotoPicto';
  pictogramId: string;
  ownerId: string;
  label: string;
  /** Stored as Blob inside IDB so the upload survives a page refresh. */
  blob: Blob;
  /**
   * Versioned Storage path minted at enqueue time (#415, `mintStoragePath`).
   * Minted once so replays reuse it; unique so IO landing late from an
   * abandoned run cannot touch a newer entry's object. Entries persisted
   * before #415 carried `extension` instead — the handler fails those
   * permanently (discard and redo) rather than replaying the old
   * deterministic-path race.
   */
  path: string;
}

export interface SetPictogramAudioEntry extends OutboxEntryBase {
  kind: 'setPictoAudio';
  pictogramId: string;
  blob: Blob;
  /** Versioned Storage path minted at enqueue time (#415) — see {@link CreatePhotoPictogramEntry.path}. */
  path: string;
}

export interface ClearPictogramAudioEntry extends OutboxEntryBase {
  kind: 'clearPictoAudio';
  pictogramId: string;
}

export interface RenamePictogramEntry extends OutboxEntryBase {
  kind: 'renamePicto';
  pictogramId: string;
  label: string;
}

export interface ReplacePictogramImageEntry extends OutboxEntryBase {
  kind: 'replacePictoImage';
  pictogramId: string;
  blob: Blob;
  /** Versioned Storage path minted at enqueue time (#415) — see {@link CreatePhotoPictogramEntry.path}. */
  path: string;
}

export interface DeletePictogramEntry extends OutboxEntryBase {
  kind: 'deletePicto';
  pictogramId: string;
}

export interface RenameKidEntry extends OutboxEntryBase {
  kind: 'renameKid';
  kidId: string;
  name: string;
}

export interface DeleteKidEntry extends OutboxEntryBase {
  kind: 'deleteKid';
  kidId: string;
}

export type OutboxEntry =
  | UpdateBoardEntry
  | CreatePhotoPictogramEntry
  | SetPictogramAudioEntry
  | ClearPictogramAudioEntry
  | RenamePictogramEntry
  | ReplacePictogramImageEntry
  | DeletePictogramEntry
  | RenameKidEntry
  | DeleteKidEntry;

export type OutboxEntryKind = OutboxEntry['kind'];
