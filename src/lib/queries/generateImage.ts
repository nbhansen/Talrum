import { FunctionsHttpError } from '@supabase/supabase-js';
import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import { captureException } from '@/lib/platform/telemetry';
import { supabase } from '@/lib/supabase';

/**
 * Client side of the generate-image edge function (#422). The whole
 * provider (Azure today) lives behind the function; this module only knows
 * the wire contract, mirrored byte-for-byte from
 * `supabase/functions/generate-image/types.ts` — tsconfig does not include
 * supabase/, so a cross-import is not possible. Change one side, change the
 * other.
 *
 * The returned Blob is a preview. Nothing is stored anywhere until the
 * parent accepts and the caller saves it through the normal pictogram
 * upload path — from that point the image is indistinguishable from an
 * upload.
 */

const GENERATE_IMAGE_FUNCTION_NAME = 'generate-image';

/** Mirrors the function's cap; the tab checks it before a round trip. */
export const MAX_LABEL_LENGTH = 60;

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

const KNOWN_CODES: ReadonlySet<string> = new Set(WIRE_ERROR_CODES);

export class GenerateImageError extends Error {
  constructor(
    public readonly code: GenerateImageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GenerateImageError';
  }
}

const codeFromHttpError = async (error: FunctionsHttpError): Promise<GenerateImageErrorCode> => {
  try {
    const body: unknown = await error.context.clone().json();
    if (
      body !== null &&
      typeof body === 'object' &&
      'error' in body &&
      typeof (body as { error: unknown }).error === 'string' &&
      KNOWN_CODES.has((body as { error: string }).error)
    ) {
      return (body as { error: GenerateImageErrorCode }).error;
    }
  } catch {
    // Unparseable body: fall through to the generic code.
  }
  return 'internal_error';
};

interface GenerateImageInput {
  label: string;
}

// Success envelope: base64-in-JSON, same reason as generate-voice —
// supabase-js reads image/* response bodies as text and exposes no
// response headers to carry a MIME type beside raw bytes.
interface SuccessResponse {
  ok: true;
  mimeType: string;
  imageBase64: string;
}

const isSuccessResponse = (v: unknown): v is SuccessResponse =>
  v !== null &&
  typeof v === 'object' &&
  (v as { ok?: unknown }).ok === true &&
  typeof (v as { mimeType?: unknown }).mimeType === 'string' &&
  typeof (v as { imageBase64?: unknown }).imageBase64 === 'string';

const decodeImage = ({ mimeType, imageBase64 }: SuccessResponse): Blob => {
  const bytes = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
};

export const useGenerateImage = (): UseMutationResult<
  Blob,
  GenerateImageError,
  GenerateImageInput
> =>
  useMutation({
    mutationFn: async ({ label }) => {
      const { data, error } = await supabase.functions.invoke<unknown>(
        GENERATE_IMAGE_FUNCTION_NAME,
        { body: { label } },
      );
      if (error) {
        if (error instanceof FunctionsHttpError) {
          // The server answered, so this is not the network's fault — a
          // broken Azure key must not look like flaky wifi, to the parent
          // or to us (#359 rationale).
          const code = await codeFromHttpError(error);
          captureException(error, {
            level: 'warning',
            tags: { component: 'generateImage', op: code },
          });
          throw new GenerateImageError(code, error.message);
        }
        throw new GenerateImageError('network', error.message);
      }
      if (!isSuccessResponse(data)) {
        throw new GenerateImageError('internal_error', 'image generation returned no image');
      }
      try {
        return decodeImage(data);
      } catch {
        throw new GenerateImageError('internal_error', 'image generation returned invalid data');
      }
    },
  });
