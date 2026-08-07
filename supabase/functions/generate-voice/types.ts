/**
 * Wire contract for the generate-voice edge function. The client mirrors
 * these literals in `src/lib/queries/generateVoice.ts` — tsconfig does not
 * include supabase/, so a cross-import is not possible. Change one side,
 * change the other.
 */

/** Languages the function accepts. A closed set: the value picks a voice. */
export const VOICE_LANGUAGES = ['da', 'en'] as const;
export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number];

/** Pictogram labels are short; this cap bounds cost and abuse. */
export const MAX_LABEL_LENGTH = 60;

export type ErrorCode =
  | 'unauthorized'
  | 'method_not_allowed'
  | 'bad_request'
  | 'synthesis_failed'
  | 'internal_error';

export interface ErrorResponse {
  ok: false;
  error: ErrorCode;
  message: string;
}

/**
 * A JSON envelope, not raw bytes: supabase-js reads any content type outside
 * its allow-list as text, and exposes no headers to carry a MIME type beside
 * octet-stream. Base64-in-JSON is self-describing, and clips are seconds long.
 */
export interface SuccessResponse {
  ok: true;
  mimeType: string;
  audioBase64: string;
}

/**
 * The provider seam. To swap providers, implement this signature in a new file
 * and change one import in index.ts. Nothing else — not the HTTP shell, not
 * the client — may know which provider runs.
 */
export type Synthesize = (
  label: string,
  language: VoiceLanguage,
) => Promise<{ bytes: Uint8Array<ArrayBuffer>; mimeType: string }>;

/** Thrown by a provider when the upstream service fails. */
export class SynthesisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SynthesisError';
  }
}
