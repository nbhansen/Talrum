import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import { invokeBlobFunction } from '@/lib/queries/edgeBlobFunction';
import { type CodedError, isCodedError } from '@/lib/queries/edgeFunction';

/**
 * Client side of the generate-image edge function (#422). The wire contract is
 * mirrored from `supabase/functions/generate-image/types.ts`, because tsconfig
 * excludes supabase/, and wireContract.test.ts pins the copies. The returned Blob is
 * a preview; nothing is stored until the caller saves it as a normal upload.
 */

export const GENERATE_IMAGE_FUNCTION_NAME = 'generate-image';

// No client-side mirror of the function's 60-character label cap: the
// Generate tab's input is capped at 40, the same as an upload label, so
// the server cap cannot be hit from the UI.

// The function's closed error codes, plus 'network' for a request that
// never got a response — the one case that really is the connection's
// fault, and the only one the "check your connection" copy fits.
export const GENERATE_IMAGE_ERROR_CODES = [
  'unauthorized',
  'method_not_allowed',
  'bad_request',
  'generation_failed',
  'internal_error',
] as const;
export type GenerateImageErrorCode = (typeof GENERATE_IMAGE_ERROR_CODES)[number] | 'network';

export type GenerateImageError = CodedError<GenerateImageErrorCode>;

export const isGenerateImageError = (err: unknown): err is GenerateImageError =>
  isCodedError<GenerateImageErrorCode>(err, [...GENERATE_IMAGE_ERROR_CODES, 'network']);

interface GenerateImageInput {
  label: string;
}

export const useGenerateImage = (): UseMutationResult<
  Blob,
  GenerateImageError,
  GenerateImageInput
> =>
  useMutation({
    mutationFn: ({ label }) =>
      invokeBlobFunction({
        functionName: GENERATE_IMAGE_FUNCTION_NAME,
        telemetryComponent: 'generateImage',
        body: { label },
        knownCodes: GENERATE_IMAGE_ERROR_CODES,
        // Base64-in-JSON: supabase-js reads image/* bodies as text and
        // exposes no response headers to carry a MIME type beside raw bytes.
        envelopeKey: 'imageBase64',
        emptyMessage: 'image generation returned no image',
        invalidMessage: 'image generation returned invalid data',
      }),
  });
