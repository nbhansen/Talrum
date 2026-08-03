import { FunctionsHttpError } from '@supabase/supabase-js';
import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import { captureException } from '@/lib/platform/telemetry';
import { supabase } from '@/lib/supabase';

/**
 * Client side of the generate-voice edge function (#422). The whole
 * provider (Azure today) lives behind the function; this module only knows
 * the wire contract, mirrored byte-for-byte from
 * `supabase/functions/generate-voice/types.ts` — tsconfig does not include
 * supabase/, so a cross-import is not possible. Change one side, change the
 * other.
 *
 * The returned Blob is a preview. Nothing is stored anywhere until the
 * parent accepts and the caller saves it through useSetPictogramAudio —
 * from that point the clip is indistinguishable from a recording.
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

const KNOWN_CODES: ReadonlySet<string> = new Set(WIRE_ERROR_CODES);

export class GenerateVoiceError extends Error {
  constructor(
    public readonly code: GenerateVoiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GenerateVoiceError';
  }
}

const codeFromHttpError = async (error: FunctionsHttpError): Promise<GenerateVoiceErrorCode> => {
  try {
    const body: unknown = await error.context.clone().json();
    if (
      body !== null &&
      typeof body === 'object' &&
      'error' in body &&
      typeof (body as { error: unknown }).error === 'string' &&
      KNOWN_CODES.has((body as { error: string }).error)
    ) {
      return (body as { error: GenerateVoiceErrorCode }).error;
    }
  } catch {
    // Unparseable body: fall through to the generic code.
  }
  return 'internal_error';
};

interface GenerateVoiceInput {
  label: string;
  language: VoiceLanguage;
}

// Success envelope: base64-in-JSON, because supabase-js reads audio/*
// response bodies as text (its parse allow-list is json / octet-stream /
// pdf / event-stream / form-data) and exposes no response headers to carry
// a MIME type beside raw bytes.
interface SuccessResponse {
  ok: true;
  mimeType: string;
  audioBase64: string;
}

const isSuccessResponse = (v: unknown): v is SuccessResponse =>
  v !== null &&
  typeof v === 'object' &&
  (v as { ok?: unknown }).ok === true &&
  typeof (v as { mimeType?: unknown }).mimeType === 'string' &&
  typeof (v as { audioBase64?: unknown }).audioBase64 === 'string';

const decodeClip = ({ mimeType, audioBase64 }: SuccessResponse): Blob => {
  const bytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
};

export const useGenerateVoice = (): UseMutationResult<
  Blob,
  GenerateVoiceError,
  GenerateVoiceInput
> =>
  useMutation({
    mutationFn: async ({ label, language }) => {
      const { data, error } = await supabase.functions.invoke<unknown>(
        GENERATE_VOICE_FUNCTION_NAME,
        { body: { label, language } },
      );
      if (error) {
        if (error instanceof FunctionsHttpError) {
          // The server answered, so this is not the network's fault — a
          // broken Azure key must not look like flaky wifi, to the parent
          // or to us (#359 rationale).
          const code = await codeFromHttpError(error);
          captureException(error, {
            level: 'warning',
            tags: { component: 'generateVoice', op: code },
          });
          throw new GenerateVoiceError(code, error.message);
        }
        throw new GenerateVoiceError('network', error.message);
      }
      if (!isSuccessResponse(data)) {
        throw new GenerateVoiceError('internal_error', 'voice generation returned no audio');
      }
      try {
        return decodeClip(data);
      } catch {
        throw new GenerateVoiceError('internal_error', 'voice generation returned invalid audio');
      }
    },
  });
