// Shared types for the delete-account edge function.
//
// Error codes are a closed set; the client switches on `error` to render
// the right toast (see src/lib/queries/account.ts). Keep this list in
// sync with that mapping — if you add a code here, add a toast there.

export type ErrorCode =
  | 'unauthorized'
  | 'method_not_allowed'
  | 'bad_request'
  | 'storage_purge_failed'
  | 'auth_delete_failed'
  | 'internal_error';

export interface SuccessResponse {
  ok: true;
}

export interface ErrorResponse {
  ok: false;
  error: ErrorCode;
  message: string;
}

export type DeleteResponse = SuccessResponse | ErrorResponse;

// Thrown by the pure deleteAccount() function for the handler to catch and
// translate into ErrorResponse. Carries the `step` for structured logging.
export class DeletionError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly step:
      | 'storage_purge_audio'
      | 'storage_purge_images'
      | 'auth_delete'
      | 'unknown',
    message: string,
  ) {
    super(message);
    this.name = 'DeletionError';
  }
}

export const STORAGE_LIST_LIMIT = 1000;
export const STORAGE_RETRY_ATTEMPTS = 3;
export const AUDIO_BUCKET = 'pictogram-audio';
export const IMAGES_BUCKET = 'pictogram-images';
