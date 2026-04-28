import { createClient } from '@supabase/supabase-js';

import { type AdminClient, deleteAccount } from './deleteAccount.ts';
import { type DeleteResponse, DeletionError, type ErrorCode } from './types.ts';

// Tests inject this shape; production builds it from env.
interface AdminLike {
  auth: {
    getUser: (jwt: string | undefined) => Promise<{
      data: { user: { id: string } | null };
      error: unknown;
    }>;
  };
  // Optional injection point for tests to swap the deletion implementation.
  __deleteImpl?: (uid: string) => Promise<void>;
}

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

const logSuccess = (userId: string, durationMs: number): void => {
  console.log(
    JSON.stringify({
      event: 'delete_account_success',
      user_id: userId,
      duration_ms: durationMs,
    }),
  );
};

// Exported so handler.test.ts can drive it directly without a live server.
// In production, serve() wraps it (see bottom of file).
export const handleRequest = async (req: Request, admin: AdminLike): Promise<Response> => {
  const start = Date.now();
  let userId: string | null = null;
  try {
    if (req.method !== 'POST') {
      return errorResponse('method_not_allowed', `method ${req.method} not allowed`, 405);
    }

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

    // Test injection: if __deleteImpl is provided, use it instead of the
    // real deleteAccount() — the unit tests can simulate failures cleanly.
    if (typeof admin.__deleteImpl === 'function') {
      await admin.__deleteImpl(userId);
    } else {
      // Production path: admin client matches the shape deleteAccount expects.
      await deleteAccount(admin as unknown as AdminClient, userId);
    }

    logSuccess(userId, Date.now() - start);
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
  Deno.serve((req) => handleRequest(req, admin as unknown as AdminLike));
}
