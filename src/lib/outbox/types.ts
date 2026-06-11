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
