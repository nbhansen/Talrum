import { encodeBase64 } from 'std/encoding/base64';

import {
  authenticate,
  type AuthLike,
  errorResponse,
  jsonResponse,
  logFailure,
  rejectNonPost,
  type SharedErrorCode,
} from './http.ts';

export type { AuthLike };

/** Pictogram labels are short; this cap bounds cost and abuse. */
export const MAX_LABEL_LENGTH = 60;

export interface GeneratedMedia {
  bytes: Uint8Array<ArrayBuffer>;
  mimeType: string;
}

/** Thrown by a provider when the server has no credentials for it (#687). */
export class NotConfiguredError extends Error {}

/** Thrown by a provider when the upstream service fails. */
export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderError';
  }
}

/** Languages both functions accept. A closed set: the value picks a voice or a prompt. */
export const GENERATE_LANGUAGES = ['da', 'en'] as const;
export type GenerateLanguage = (typeof GENERATE_LANGUAGES)[number];

const isGenerateLanguage = (v: unknown): v is GenerateLanguage =>
  typeof v === 'string' && (GENERATE_LANGUAGES as readonly string[]).includes(v);

export interface GenerateInput {
  label: string;
  language: GenerateLanguage;
}

/** The codes this shell sends. Each function's ErrorCode must include them (#598). */
export type GenerateErrorCode =
  | SharedErrorCode
  | 'bad_request'
  | 'not_configured'
  | 'internal_error';

export interface GenerateConfig<ProviderCode extends string> {
  /** Telemetry event name, e.g. 'generate_image_failed'. */
  failureEvent: string;
  run: (input: GenerateInput) => Promise<GeneratedMedia>;
  /**
   * JSON field carrying the base64 payload. A JSON envelope, not raw bytes:
   * supabase-js reads content types outside its allow-list as text and
   * exposes no headers, so base64-in-JSON keeps the MIME type with the bytes.
   */
  envelopeKey: 'imageBase64' | 'audioBase64';
  /** Sent with a 502 when `run` throws a ProviderError. */
  providerCode: ProviderCode;
  providerMessage: string;
}

/**
 * The HTTP shell generate-image and generate-voice share: CORS, method, auth,
 * body and label validation, the base64 JSON envelope, and error mapping.
 * The config owns everything function-specific. Neither function writes: the
 * client previews the bytes and saves them through the normal upload path.
 */
export const handleGenerate = async <ProviderCode extends string>(
  req: Request,
  admin: AuthLike,
  cfg: GenerateConfig<ProviderCode>,
): Promise<Response> => {
  const fail = (code: GenerateErrorCode | ProviderCode, message: string, status: number) =>
    errorResponse(code, message, status);
  let userId: string | null = null;
  try {
    const rejected = rejectNonPost(req);
    if (rejected) return rejected;
    const caller = await authenticate(req, admin);
    if (caller instanceof Response) return caller;
    userId = caller;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail('bad_request', 'request body must be JSON', 400);
    }
    if (body === null || typeof body !== 'object') {
      return fail('bad_request', 'request body must be an object', 400);
    }
    const label = (body as { label?: unknown }).label;
    if (typeof label !== 'string' || label.trim().length === 0) {
      return fail('bad_request', 'label must be a non-empty string', 400);
    }
    if (label.length > MAX_LABEL_LENGTH) {
      return fail('bad_request', `label must be at most ${MAX_LABEL_LENGTH} characters`, 400);
    }
    const language = (body as { language?: unknown }).language;
    if (!isGenerateLanguage(language)) {
      return fail('bad_request', `language must be one of: ${GENERATE_LANGUAGES.join(', ')}`, 400);
    }

    const { bytes, mimeType } = await cfg.run({ label: label.trim(), language });
    return jsonResponse({ ok: true, mimeType, [cfg.envelopeKey]: encodeBase64(bytes) }, 200);
  } catch (err) {
    if (err instanceof NotConfiguredError) {
      logFailure(cfg.failureEvent, userId, 'config', err);
      return fail('not_configured', 'generation is not set up on this server', 503);
    }
    if (err instanceof ProviderError) {
      logFailure(cfg.failureEvent, userId, 'provider', err);
      return fail(cfg.providerCode, cfg.providerMessage, 502);
    }
    logFailure(cfg.failureEvent, userId, 'unknown', err);
    return fail('internal_error', 'unexpected error', 500);
  }
};
