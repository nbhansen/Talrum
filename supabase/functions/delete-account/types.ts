// Shared types for the delete-account edge function.
//
// Error codes are a closed set; the client switches on `error` to render
// the right toast (see src/lib/queries/account.ts). Keep this list in
// sync with that mapping — if you add a code here, add a toast there.

// Function name as registered with Supabase (the directory name under
// supabase/functions/). The client invokes it via this string; pinned here
// so a directory rename surfaces as a TypeScript error rather than a
// runtime 404. Mirrored byte-for-byte by DELETE_ACCOUNT_FUNCTION_NAME in
// src/lib/queries/account.ts — tsconfig doesn't include supabase/ so a
// direct import isn't possible.
export const DELETE_ACCOUNT_FUNCTION_NAME = 'delete-account';

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
