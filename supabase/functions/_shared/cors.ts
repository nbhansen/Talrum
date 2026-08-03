/**
 * CORS headers for browser calls to edge functions. The Supabase gateway
 * does NOT answer preflight for you: without an OPTIONS branch the browser
 * sends OPTIONS, the handler answers 405 with no CORS headers, and the
 * browser kills the real request as net::ERR_FAILED — which the client
 * cannot tell apart from being offline (#435).
 *
 * The wildcard origin is safe here: every function requires a caller JWT in
 * the Authorization header, so CORS is not the access control — auth is.
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
} as const;

/** The preflight response; return this before any method or auth check. */
export const preflightResponse = (): Response =>
  new Response(null, { status: 204, headers: corsHeaders });
