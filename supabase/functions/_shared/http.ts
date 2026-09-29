import { corsHeaders, preflightResponse } from './cors.ts';

export interface AuthLike {
  auth: {
    getUser: (jwt: string) => Promise<{ data: { user: { id: string } | null } }>;
  };
}

/** The codes this file sends. Each function's ErrorCode must include them (#598). */
export type SharedErrorCode = 'unauthorized' | 'method_not_allowed';

export const jsonResponse = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders },
  });

export const errorResponse = (code: string, message: string, status: number): Response =>
  jsonResponse({ ok: false, error: code, message }, status);

export const logFailure = (
  event: string,
  userId: string | null,
  step: string,
  error: unknown,
): void => {
  console.error(
    JSON.stringify({
      event,
      user_id: userId,
      step,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
};

/**
 * The response for a preflight or a non-POST, or null to go on. Preflight
 * comes before any auth check: it carries no Authorization header, and a
 * non-2xx kills the real request (#435).
 */
export const rejectNonPost = (req: Request): Response | null => {
  if (req.method === 'OPTIONS') return preflightResponse();
  if (req.method !== 'POST') {
    return errorResponse(
      'method_not_allowed' satisfies SharedErrorCode,
      `method ${req.method} not allowed`,
      405,
    );
  }
  return null;
};

/**
 * The caller's user id, or the 401 to return. A missing Bearer token fails
 * before getUser, so unauthenticated spam costs a header read, not an auth
 * round-trip.
 */
export const authenticate = async (req: Request, admin: AuthLike): Promise<string | Response> => {
  const auth = req.headers.get('Authorization') ?? '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
  if (jwt.length === 0) {
    return errorResponse(
      'unauthorized' satisfies SharedErrorCode,
      'missing or malformed Authorization header',
      401,
    );
  }
  const { data } = await admin.auth.getUser(jwt);
  if (!data.user)
    return errorResponse('unauthorized' satisfies SharedErrorCode, 'missing or invalid JWT', 401);
  return data.user.id;
};
