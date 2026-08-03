import { createClient } from '@supabase/supabase-js';
import { encodeBase64 } from 'std/encoding/base64';

import { corsHeaders, preflightResponse } from '../_shared/cors.ts';
import { synthesizeWithAzure } from './azure.ts';
import {
  type ErrorCode,
  type ErrorResponse,
  MAX_LABEL_LENGTH,
  type SuccessResponse,
  SynthesisError,
  type Synthesize,
  VOICE_LANGUAGES,
  type VoiceLanguage,
} from './types.ts';

/**
 * Turns a pictogram label into spoken audio (#422). The HTTP shell below
 * owns auth, validation and error codes; the provider behind the Synthesize
 * seam owns everything vendor-specific. See types.ts for the contract and
 * azure.ts for the one Azure-aware file.
 *
 * The client previews the returned bytes and saves them through the normal
 * pictogram-audio upload path only when the parent accepts — this function
 * writes nothing to Storage or the database.
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
      event: 'generate_voice_failed',
      user_id: userId,
      step,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
};

const isVoiceLanguage = (v: unknown): v is VoiceLanguage =>
  typeof v === 'string' && (VOICE_LANGUAGES as readonly string[]).includes(v);

// Exported so handler.test.ts can drive it directly without a live server.
// The synthesize parameter is the provider seam; tests pass a stub.
export const handleRequest = async (
  req: Request,
  admin: AuthLike,
  synthesize: Synthesize = synthesizeWithAzure,
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

    // Same short-circuit as delete-account: unauthenticated spam costs a
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
    const language = (body as { language?: unknown }).language;
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
    if (!isVoiceLanguage(language)) {
      return errorResponse(
        'bad_request',
        `language must be one of: ${VOICE_LANGUAGES.join(', ')}`,
        400,
      );
    }

    const { bytes, mimeType } = await synthesize(label.trim(), language);
    // A JSON envelope, not raw bytes — see SuccessResponse in types.ts for
    // why (supabase-js would read audio/mpeg as text).
    const payload: SuccessResponse = { ok: true, mimeType, audioBase64: encodeBase64(bytes) };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    if (err instanceof SynthesisError) {
      logFailure(userId, 'synthesize', err);
      return errorResponse('synthesis_failed', 'voice generation failed, try again', 502);
    }
    logFailure(userId, 'unknown', err);
    return errorResponse('internal_error', 'unexpected error', 500);
  }
};

if (import.meta.main) {
  const url = Deno.env.get('SUPABASE_URL');
  // Anon key, deliberately: the only Supabase call here is auth.getUser
  // with the caller's own JWT. delete-account needs service role to purge
  // users and buckets; a bug in this handler should run with RLS intact.
  const key = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set');
  }
  const client = createClient(url, key, { auth: { persistSession: false } });
  Deno.serve((req) => handleRequest(req, client));
}
