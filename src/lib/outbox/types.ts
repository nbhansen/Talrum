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

/** Discriminated union; step 6 adds CreatePhotoPicto / SetPictoAudio / ClearPictoAudio. */
export type OutboxEntry = UpdateBoardEntry;

export type OutboxEntryKind = OutboxEntry['kind'];
