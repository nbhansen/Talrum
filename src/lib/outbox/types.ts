import type { BoardKind, VoiceMode } from '@/types/domain';

/**
 * Patch shape for a board UPDATE. Field names match the DB columns so the
 * handler can pass it straight to `supabase.from('boards').update(patch)`.
 */
export interface BoardRowPatch {
  name?: string;
  kind?: BoardKind;
  labels_visible?: boolean;
  voice_mode?: VoiceMode;
  step_ids?: string[];
  kid_reorderable?: boolean;
}

export type OutboxEntryStatus = 'pending' | 'failed';

interface OutboxEntryBase {
  /** ULID — monotonically sortable, stable across reloads. */
  id: string;
  enqueuedAt: number;
  attemptCount: number;
  status: OutboxEntryStatus;
  /** Last error message, surfaced in the indicator's failed-pill. */
  lastError?: string;
}

export interface UpdateBoardEntry extends OutboxEntryBase {
  kind: 'updateBoard';
  boardId: string;
  patch: BoardRowPatch;
}

export interface CreatePhotoPictogramEntry extends OutboxEntryBase {
  kind: 'createPhotoPicto';
  pictogramId: string;
  ownerId: string;
  label: string;
  /** Stored as Blob inside IDB so the upload survives a page refresh. */
  blob: Blob;
  extension: string;
}

export interface SetPictogramAudioEntry extends OutboxEntryBase {
  kind: 'setPictoAudio';
  pictogramId: string;
  ownerId: string;
  blob: Blob;
  extension: string;
  /** Path of an older recording to clean up after the new one lands. */
  previousPath?: string;
}

export interface ClearPictogramAudioEntry extends OutboxEntryBase {
  kind: 'clearPictoAudio';
  pictogramId: string;
  path: string;
}

export interface RenamePictogramEntry extends OutboxEntryBase {
  kind: 'renamePicto';
  pictogramId: string;
  label: string;
}

export interface ReplacePictogramImageEntry extends OutboxEntryBase {
  kind: 'replacePictoImage';
  pictogramId: string;
  ownerId: string;
  blob: Blob;
  extension: string;
  /**
   * Path of the prior image to delete after the new one lands. Stock-prefixed
   * paths (`stock:<slug>`) and missing values are ignored — only real Storage
   * objects are removed.
   */
  previousPath?: string;
}

export interface DeletePictogramEntry extends OutboxEntryBase {
  kind: 'deletePicto';
  pictogramId: string;
  /** Storage paths to clean up. Stock-prefixed paths are skipped by the handler. */
  previousImagePath?: string;
  previousAudioPath?: string;
  /**
   * Boards whose `step_ids` reference this pictogram. Scrubbed via
   * `array_remove` before the row is deleted, so we don't leave dangling
   * UUIDs in any board the user owns.
   */
  scrubFromBoardIds: string[];
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
