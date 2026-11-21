import type { SharedErrorCode } from '../_shared/http.ts';

// Error codes are a closed set; the client switches on `error` to pick a toast
// (src/lib/queries/account.ts). Add a code here, add a toast there.

export type ErrorCode =
  | SharedErrorCode
  | 'bad_request'
  | 'storage_purge_failed'
  | 'auth_delete_failed'
  | 'internal_error';

// Thrown by the pure deleteAccount() function for the handler to catch and
// translate into an error response. Carries the `step` for structured logging.
export class DeletionError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly step: 'storage_purge_audio' | 'storage_purge_images' | 'auth_delete',
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
