import { createClient } from '@supabase/supabase-js';

import { type AuthLike, handleGenerate } from '../_shared/generateHandler.ts';
import { synthesizeWithAzure } from './azure.ts';
import type { ErrorCode, Synthesize } from './types.ts';

/**
 * Turns a pictogram label into spoken audio (#422). The shared handler owns
 * auth, validation and error codes; the provider behind the Synthesize seam
 * owns everything vendor-specific.
 */

// Exported so handler.test.ts can drive it directly without a live server.
// The synthesize parameter is the provider seam; tests pass a stub.
export const handleRequest = (
  req: Request,
  admin: AuthLike,
  synthesize: Synthesize = synthesizeWithAzure,
): Promise<Response> =>
  handleGenerate(req, admin, {
    failureEvent: 'generate_voice_failed',
    run: ({ label, language }) => synthesize(label, language),
    envelopeKey: 'audioBase64',
    providerCode: 'synthesis_failed' satisfies ErrorCode,
    providerMessage: 'voice generation failed, try again',
  });

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
