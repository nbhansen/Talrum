/**
 * Wire contract for the generate-image edge function. The client mirrors
 * these literals in `src/lib/queries/generateImage.ts` — tsconfig does not
 * include supabase/, so a cross-import is not possible. Change one side,
 * change the other.
 */

/** Pictogram labels are short; this cap bounds cost and abuse. */
export const MAX_LABEL_LENGTH = 60;

export type ErrorCode =
  | 'unauthorized'
  | 'method_not_allowed'
  | 'bad_request'
  | 'generation_failed'
  | 'internal_error';

export interface ErrorResponse {
  ok: false;
  error: ErrorCode;
  message: string;
}

/**
 * Success is a JSON envelope, not raw image bytes — the same reason as
 * generate-voice: supabase-js parses responses by a content-type allow-list
 * and exposes no response headers, so base64-in-JSON keeps the image and its
 * real MIME type in one self-describing shape.
 */
export interface SuccessResponse {
  ok: true;
  mimeType: string;
  imageBase64: string;
}

/**
 * The provider seam. The prompt arrives fully built, because the style template
 * is app policy and not provider knowledge. To swap providers, implement this
 * signature in a new file and change one import in index.ts.
 */
export type GenerateImage = (
  prompt: string,
) => Promise<{ bytes: Uint8Array<ArrayBuffer>; mimeType: string }>;

/** Thrown by a provider when the upstream service fails. */
export class GenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GenerationError';
  }
}
