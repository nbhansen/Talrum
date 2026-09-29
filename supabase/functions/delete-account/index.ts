import { createClient } from '@supabase/supabase-js';

import {
  authenticate,
  errorResponse as sharedErrorResponse,
  jsonResponse,
  logFailure as sharedLogFailure,
  rejectNonPost,
} from '../_shared/http.ts';
import { type AdminClient, deleteAccount } from './deleteAccount.ts';
import { type DeleteResponse, DeletionError, type ErrorCode } from './types.ts';

// Handler only needs auth.getUser to identify the caller. The full deletion
// is handed off to deleteFn, so the handler's view of the admin client is
// narrower than deleteAccount's. AdminLike is structurally a subset of
// AdminClient, so a real client is assignable to AdminLike without casting.
type AdminLike = Pick<AdminClient, 'auth'>;

// Narrowed to this function's closed code set (types.ts).
const errorResponse: (code: ErrorCode, message: string, status: number) => Response =
  sharedErrorResponse;

const logFailure = (userId: string | null, step: string, error: unknown): void =>
  sharedLogFailure('delete_account_failed', userId, step, error);

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

// Exported so handler.test.ts can drive it without a live server; serve()
// wraps it at the bottom of the file. `deleteFn` is an explicit parameter
// rather than a field on the admin object, so a buggy or hostile admin shape
// cannot silently bypass deletion.
export const handleRequest = async (
  req: Request,
  admin: AdminLike,
  deleteFn: (uid: string) => Promise<{ audioCount: number; imageCount: number }>,
): Promise<Response> => {
  const start = Date.now();
  let userId: string | null = null;
  try {
    const rejected = rejectNonPost(req);
    if (rejected) return rejected;

    // Byte equality, not JSON parsing: the user id comes from the verified
    // JWT, so there is nothing in a body worth trusting, and parsing would
    // accept `{"user_id":"someone-else"}` as well-formed input this would then
    // have to reject explicitly. supabase-js controls both ends of the shape.
    const raw = (await req.text()).trim();
    if (raw !== '' && raw !== '{}') {
      return errorResponse('bad_request', 'request body must be empty or {}', 400);
    }

    const caller = await authenticate(req, admin);
    if (caller instanceof Response) return caller;
    userId = caller;

    const result = await deleteFn(userId);

    logSuccess(userId, result.audioCount, result.imageCount, Date.now() - start);
    return jsonResponse({ ok: true } satisfies DeleteResponse, 200);
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
  // One cast at the env boundary: AdminClient is the hand-rolled structural
  // subset of the supabase-js client this function actually uses.
  const admin = createClient(url, key, {
    auth: { persistSession: false },
  }) as unknown as AdminClient;
  Deno.serve((req) => handleRequest(req, admin, (uid) => deleteAccount(admin, uid)));
}
