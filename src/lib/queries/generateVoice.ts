import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import { invokeBlobFunction } from '@/lib/queries/edgeBlobFunction';

/**
 * Client side of the generate-voice edge function (#422). The wire contract is
 * mirrored from `supabase/functions/generate-voice/types.ts`, because tsconfig
 * excludes supabase/. Change one side, change the other. The returned Blob is
 * a preview; nothing is stored until the caller saves it as a recording.
 */

const GENERATE_VOICE_FUNCTION_NAME = 'generate-voice';

/** Mirrors the function's closed language set. */
export type VoiceLanguage = 'da' | 'en';

/** Mirrors the function's cap; the dialog checks it before a round trip. */
export const MAX_LABEL_LENGTH = 60;

// The function's closed error codes, plus 'network' for a request that
// never got a response — the one case that really is the connection's
// fault, and the only one the "check your connection" copy fits.
const WIRE_ERROR_CODES = [
  'unauthorized',
  'method_not_allowed',
  'bad_request',
  'synthesis_failed',
  'internal_error',
] as const;
export type GenerateVoiceErrorCode = (typeof WIRE_ERROR_CODES)[number] | 'network';

const KNOWN_CODES: ReadonlySet<GenerateVoiceErrorCode> = new Set(WIRE_ERROR_CODES);

export class GenerateVoiceError extends Error {
  constructor(
    public readonly code: GenerateVoiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GenerateVoiceError';
  }
}

interface GenerateVoiceInput {
  label: string;
  language: VoiceLanguage;
}

export const useGenerateVoice = (): UseMutationResult<
  Blob,
  GenerateVoiceError,
  GenerateVoiceInput
> =>
  useMutation({
    mutationFn: ({ label, language }) =>
      invokeBlobFunction({
        functionName: GENERATE_VOICE_FUNCTION_NAME,
        telemetryComponent: 'generateVoice',
        body: { label, language },
        knownCodes: KNOWN_CODES,
        // Base64-in-JSON: supabase-js reads audio/* bodies as text (its parse
        // allow-list is json / octet-stream / pdf / event-stream / form-data)
        // and exposes no response headers to carry a MIME type.
        envelopeKey: 'audioBase64',
        makeError: (code, message) => new GenerateVoiceError(code, message),
        emptyMessage: 'voice generation returned no audio',
        invalidMessage: 'voice generation returned invalid audio',
      }),
  });
