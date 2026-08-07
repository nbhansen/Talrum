import { createClient } from '@supabase/supabase-js';
import { encodeBase64 } from 'std/encoding/base64';

import { corsHeaders, preflightResponse } from '../_shared/cors.ts';
import { generateWithAzure } from './azure.ts';
import { buildImagePrompt } from './prompt.ts';
import {
  type ErrorCode,
  type ErrorResponse,
  type GenerateImage,
  GenerationError,
  MAX_LABEL_LENGTH,
  type SuccessResponse,
} from './types.ts';

/**
 * Turns a pictogram label into an image (#422). The shell below owns auth,
 * validation and error codes; prompt.ts owns the style template; the provider
 * owns everything vendor-specific. This function writes nothing: the client
 * previews the bytes and saves them through the normal upload path.
 */

interface AuthLike {
  auth: {
    getUser: (jwt: string) => Promise<{ data: { user: { id: string } | null } }>;
  };
}

const errorResponse = (code: ErrorCode, message: string, status: number): Response =>
  new Response(JSON.stringify({ ok: false, error: code, message } satisfies ErrorResponse), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders },
  });

const logFailure = (userId: string | null, step: string, error: unknown): void => {
  console.error(
    JSON.stringify({
      event: 'generate_image_failed',
      user_id: userId,
      step,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
};

// Exported so handler.test.ts can drive it directly without a live server.
// The generate parameter is the provider seam; tests pass a stub.
export const handleRequest = async (
  req: Request,
  admin: AuthLike,
  generate: GenerateImage = generateWithAzure,
): Promise<Response> => {
  let userId: string | null = null;
  try {
    // Before any method or auth check: the browser's preflight carries no
    // Authorization header, and a non-2xx kills the real request (#435).
    if (req.method === 'OPTIONS') {
      return preflightResponse();
    }
    if (req.method !== 'POST') {
      return errorResponse('method_not_allowed', `method ${req.method} not allowed`, 405);
    }

    // Same short-circuit as generate-voice: unauthenticated spam costs a
    // header read, not an auth round-trip.
    const auth = req.headers.get('Authorization') ?? '';
    const jwt = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
    if (jwt.length === 0) {
      return errorResponse('unauthorized', 'missing or malformed Authorization header', 401);
    }
    const { data } = await admin.auth.getUser(jwt);
    if (!data.user) {
      return errorResponse('unauthorized', 'missing or invalid JWT', 401);
    }
    userId = data.user.id;

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

    const { bytes, mimeType } = await generate(buildImagePrompt(label.trim()));
    // A JSON envelope, not raw bytes — see SuccessResponse in types.ts.
    const payload: SuccessResponse = { ok: true, mimeType, imageBase64: encodeBase64(bytes) };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    if (err instanceof GenerationError) {
      logFailure(userId, 'generate', err);
      return errorResponse('generation_failed', 'image generation failed, try again', 502);
    }
    logFailure(userId, 'unknown', err);
    return errorResponse('internal_error', 'unexpected error', 500);
  }
};

if (import.meta.main) {
  const url = Deno.env.get('SUPABASE_URL');
  // Anon key, deliberately: the only Supabase call here is auth.getUser
  // with the caller's own JWT — same reasoning as generate-voice.
  const key = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set');
  }
  const client = createClient(url, key, { auth: { persistSession: false } });
  Deno.serve((req) => handleRequest(req, client));
}
