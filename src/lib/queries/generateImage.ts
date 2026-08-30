import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import { invokeBlobFunction } from '@/lib/queries/edgeBlobFunction';

/**
 * Client side of the generate-image edge function (#422). The wire contract is
 * mirrored from `supabase/functions/generate-image/types.ts`, because tsconfig
 * excludes supabase/. Change one side, change the other. The returned Blob is
 * a preview; nothing is stored until the caller saves it as a normal upload.
 */

const GENERATE_IMAGE_FUNCTION_NAME = 'generate-image';

// No client-side mirror of the function's 60-character label cap: the
// Generate tab's input is capped at 40, the same as an upload label, so
// the server cap cannot be hit from the UI.

// The function's closed error codes, plus 'network' for a request that
// never got a response — the one case that really is the connection's
// fault, and the only one the "check your connection" copy fits.
const WIRE_ERROR_CODES = [
  'unauthorized',
  'method_not_allowed',
  'bad_request',
  'generation_failed',
  'internal_error',
] as const;
export type GenerateImageErrorCode = (typeof WIRE_ERROR_CODES)[number] | 'network';

const KNOWN_CODES: ReadonlySet<GenerateImageErrorCode> = new Set(WIRE_ERROR_CODES);

export class GenerateImageError extends Error {
  constructor(
    public readonly code: GenerateImageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GenerateImageError';
  }
}

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
        knownCodes: KNOWN_CODES,
        // Base64-in-JSON: supabase-js reads image/* bodies as text and
        // exposes no response headers to carry a MIME type beside raw bytes.
        envelopeKey: 'imageBase64',
        makeError: (code, message) => new GenerateImageError(code, message),
        emptyMessage: 'image generation returned no image',
        invalidMessage: 'image generation returned invalid data',
      }),
  });
