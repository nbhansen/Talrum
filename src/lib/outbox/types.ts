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

export type OutboxEntry =
  | UpdateBoardEntry
  | CreatePhotoPictogramEntry
  | SetPictogramAudioEntry
  | ClearPictogramAudioEntry;

export type OutboxEntryKind = OutboxEntry['kind'];
