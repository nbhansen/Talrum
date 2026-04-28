import { createClient } from '@supabase/supabase-js';

import { type AdminClient, deleteAccount } from './deleteAccount.ts';
import { type DeleteResponse, DeletionError, type ErrorCode } from './types.ts';

// Handler only needs auth.getUser to identify the caller. The full deletion
// is handed off to deleteFn, so the handler's view of the admin client is
// narrower than deleteAccount's. AdminLike is structurally a subset of
// AdminClient, so a real client is assignable to AdminLike without casting.
type AdminLike = Pick<AdminClient, 'auth'>;

const errorResponse = (code: ErrorCode, message: string, status: number): Response =>
  new Response(JSON.stringify({ ok: false, error: code, message } satisfies DeleteResponse), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const okResponse = (): Response =>
  new Response(JSON.stringify({ ok: true } satisfies DeleteResponse), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const logFailure = (userId: string | null, step: string, error: unknown): void => {
  console.error(
    JSON.stringify({
      event: 'delete_account_failed',
      user_id: userId,
      step,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
};

const logSuccess = (
  userId: string,
  audioCount: number,
  imageCount: number,
  durationMs: number,
): void => {
  console.log(
    JSON.stringify({
      event: 'delete_account_success',
      user_id: userId,
      audio_count: audioCount,
      image_count: imageCount,
      duration_ms: durationMs,
    }),
  );
};

// Exported so handler.test.ts can drive it directly without a live server.
// In production, serve() wraps it (see bottom of file).
//
// deleteFn is the deletion implementation. The default uses the real
// deleteAccount() against the admin client; tests pass a stub to simulate
// failures or skip the work entirely. Keeping the seam as an explicit
// parameter (instead of a magic field on the admin object) means a buggy or
// hostile admin shape can't silently bypass deletion.
export const handleRequest = async (
  req: Request,
  admin: AdminLike,
  deleteFn: (uid: string) => Promise<{ audioCount: number; imageCount: number }> = (uid) =>
    deleteAccount(admin as AdminClient, uid),
): Promise<Response> => {
  const start = Date.now();
  let userId: string | null = null;
  try {
    if (req.method !== 'POST') {
      return errorResponse('method_not_allowed', `method ${req.method} not allowed`, 405);
    }

    // Body must be empty string or "{}" (the exact serialization supabase-js
    // produces for `functions.invoke('...', { body: {} })`). We do byte
    // equality, not JSON parsing, because:
    //   1. user_id comes from the verified JWT, never the body — there is
    //      nothing to read out of a non-empty body that we'd trust.
    //   2. JSON.parse would tolerate `{"user_id":"someone-else"}` as
    //      well-formed input that we would then have to explicitly reject.
    //      Byte equality eliminates the entire class of "what fields are
    //      we accepting?" review questions.
    //   3. supabase-js controls both ends of this contract; the byte
    //      shape is stable.
    const raw = (await req.text()).trim();
    if (raw !== '' && raw !== '{}') {
      return errorResponse('bad_request', 'request body must be empty or {}', 400);
    }

    const auth = req.headers.get('Authorization') ?? '';
    const jwt = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : undefined;
    const { data } = await admin.auth.getUser(jwt);
    if (!data.user) {
      return errorResponse('unauthorized', 'missing or invalid JWT', 401);
    }
    userId = data.user.id;

    const result = await deleteFn(userId);

    logSuccess(userId, result.audioCount, result.imageCount, Date.now() - start);
    return okResponse();
  } catch (err) {
    if (err instanceof DeletionError) {
      logFailure(userId, err.step, err);
      return errorResponse(err.code, err.message, 500);
    }
    logFailure(userId, 'unknown', err);
    return errorResponse('internal_error', 'unexpected error', 500);
  }
};

// Production entry point: build the admin client from env and start serving.
// Deno.serve is the native runtime entrypoint (std@1 dropped the serve export).
if (import.meta.main) {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  Deno.serve((req) => handleRequest(req, admin as unknown as AdminClient));
}
