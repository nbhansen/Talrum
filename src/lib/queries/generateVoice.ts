import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import { invokeBlobFunction } from '@/lib/queries/edgeBlobFunction';
import type { CodedError } from '@/lib/queries/edgeFunction';

/**
 * Client side of the generate-voice edge function (#422). The wire contract is
 * mirrored from `supabase/functions/generate-voice/types.ts`, because tsconfig
 * excludes supabase/, and wireContract.test.ts pins the copies. The returned Blob is
 * a preview; nothing is stored until the caller saves it as a recording.
 */

export const GENERATE_VOICE_FUNCTION_NAME = 'generate-voice';

/** Mirrors the function's closed language set. */
export type VoiceLanguage = 'da' | 'en';

/** Mirrors the function's cap; the dialog checks it before a round trip. */
export const MAX_LABEL_LENGTH = 60;

// The function's closed error codes, plus 'network' for a request that
// never got a response — the one case that really is the connection's
// fault, and the only one the "check your connection" copy fits.
export const GENERATE_VOICE_ERROR_CODES = [
  'unauthorized',
  'method_not_allowed',
  'bad_request',
  'synthesis_failed',
  'internal_error',
] as const;
export type GenerateVoiceErrorCode = (typeof GENERATE_VOICE_ERROR_CODES)[number] | 'network';

export type GenerateVoiceError = CodedError<GenerateVoiceErrorCode>;

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
        knownCodes: GENERATE_VOICE_ERROR_CODES,
        // Base64-in-JSON: supabase-js reads audio/* bodies as text (its parse
        // allow-list is json / octet-stream / pdf / event-stream / form-data)
        // and exposes no response headers to carry a MIME type.
        envelopeKey: 'audioBase64',
        emptyMessage: 'voice generation returned no audio',
        invalidMessage: 'voice generation returned invalid audio',
      }),
  });
