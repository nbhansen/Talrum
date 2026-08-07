/**
 * The Supabase gateway does not answer preflight, so without an OPTIONS branch
 * the browser kills the real request as net::ERR_FAILED, which the client
 * cannot tell apart from being offline (#435). The wildcard origin is safe:
 * every function requires a caller JWT, so auth is the access control.
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
} as const;

/** The preflight response; return this before any method or auth check. */
export const preflightResponse = (): Response =>
  new Response(null, { status: 204, headers: corsHeaders });
