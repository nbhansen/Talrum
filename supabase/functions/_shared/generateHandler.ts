import { encodeBase64 } from 'std/encoding/base64';

import {
  authenticate,
  type AuthLike,
  errorResponse,
  jsonResponse,
  logFailure,
  rejectNonPost,
} from './http.ts';

export type { AuthLike };

/** Pictogram labels are short; this cap bounds cost and abuse. */
export const MAX_LABEL_LENGTH = 60;

export interface GeneratedMedia {
  bytes: Uint8Array<ArrayBuffer>;
  mimeType: string;
}

export type ParseResult<Input> = { ok: true; input: Input } | { ok: false; message: string };

export interface GenerateConfig<Input> {
  /** Telemetry event name, e.g. 'generate_image_failed'. */
  failureEvent: string;
  /** Runs after the shared label checks; validates function-specific fields. */
  parseInput: (label: string, body: Record<string, unknown>) => ParseResult<Input>;
  run: (input: Input) => Promise<GeneratedMedia>;
  /** JSON field carrying the base64 payload — see SuccessResponse in types.ts. */
  envelopeKey: 'imageBase64' | 'audioBase64';
  providerError: {
    is: (err: unknown) => boolean;
    code: string;
    message: string;
  };
}

/**
 * The HTTP shell generate-image and generate-voice share: CORS, method, auth,
 * body and label validation, the base64 JSON envelope, and error mapping.
 * The config owns everything function-specific. Neither function writes: the
 * client previews the bytes and saves them through the normal upload path.
 */
export const handleGenerate = async <Input>(
  req: Request,
  admin: AuthLike,
  cfg: GenerateConfig<Input>,
): Promise<Response> => {
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
      return errorResponse('bad_request', 'request body must be JSON', 400);
    }
    if (body === null || typeof body !== 'object') {
      return errorResponse('bad_request', 'request body must be an object', 400);
    }
    const label = (body as { label?: unknown }).label;
    if (typeof label !== 'string' || label.trim().length === 0) {
      return errorResponse('bad_request', 'label must be a non-empty string', 400);
    }
    if (label.length > MAX_LABEL_LENGTH) {
      return errorResponse(
        'bad_request',
        `label must be at most ${MAX_LABEL_LENGTH} characters`,
        400,
      );
    }
    const parsed = cfg.parseInput(label.trim(), body as Record<string, unknown>);
    if (!parsed.ok) {
      return errorResponse('bad_request', parsed.message, 400);
    }

    const { bytes, mimeType } = await cfg.run(parsed.input);
    return jsonResponse({ ok: true, mimeType, [cfg.envelopeKey]: encodeBase64(bytes) }, 200);
  } catch (err) {
    if (cfg.providerError.is(err)) {
      logFailure(cfg.failureEvent, userId, 'provider', err);
      return errorResponse(cfg.providerError.code, cfg.providerError.message, 502);
    }
    logFailure(cfg.failureEvent, userId, 'unknown', err);
    return errorResponse('internal_error', 'unexpected error', 500);
  }
};
