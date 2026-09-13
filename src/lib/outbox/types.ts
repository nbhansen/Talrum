import type { BoardKind, VoiceMode } from '@/types/domain';
import type { Database } from '@/types/supabase';

type BoardUpdate = Database['public']['Tables']['boards']['Update'];

/**
 * Derived from the generated `boards` Update type so a schema change cannot
 * leave it stale. `kind` and `voice_mode` are re-narrowed to their domain
 * unions, which stops a caller queueing an arbitrary string into a `text`
 * column.
 */
export type BoardRowPatch = Pick<
  BoardUpdate,
  'name' | 'labels_visible' | 'step_ids' | 'kid_reorderable'
> & {
  kind?: BoardKind;
  voice_mode?: VoiceMode;
};

/**
 * `attempting` means a handler is running against the entry right now, so it
 * is neither counted nor drained (#445). The lock is held for the whole
 * attempt and the browser releases it when a tab dies, which makes an
 * `attempting` entry seen from inside the lock proof that its owner is gone.
 */
export type OutboxEntryStatus = 'pending' | 'attempting' | 'failed';

/**
 * Program state: `conflictCount` and the Retry guard-strip key off it.
 * `lastError` is display copy and must never be compared against (#392).
 */
export type OutboxFailureKind = 'conflict' | 'permanent';

interface OutboxEntryBase {
  /** ULID — monotonically sortable, stable across reloads. */
  id: string;
  /**
   * Not named `ownerId`, because `CreatePhotoPictogramEntry.ownerId` is a
   * payload field and one name would let this stamp overwrite it through a
   * spread. Optional for entries written before the stamp existed (#446).
   */
  enqueuedBy?: string;
  enqueuedAt: number;
  attemptCount: number;
  status: OutboxEntryStatus;
  /** Display copy for the failed-pill. See {@link OutboxFailureKind}. */
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
   * handler updates conditionally, and zero rows means another device wrote
   * the board since (#281). Absent means plain last-write-wins.
   */
  expectedUpdatedAt?: string;
}

export interface CreatePhotoPictogramEntry extends OutboxEntryBase {
  kind: 'createPhotoPicto';
  pictogramId: string;
  ownerId: string;
  label: string;
  blob: Blob;
  /**
   * Minted once at enqueue time so replays reuse it, and unique so IO landing
   * late from an abandoned run cannot touch a newer entry's object (#415).
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

export interface DeleteBoardEntry extends OutboxEntryBase {
  kind: 'deleteBoard';
  boardId: string;
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
  | DeleteKidEntry
  | DeleteBoardEntry;
