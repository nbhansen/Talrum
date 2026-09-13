import { createClient } from '@supabase/supabase-js';

import { type AuthLike, handleGenerate } from '../_shared/generateHandler.ts';
import { generateWithAzure } from './azure.ts';
import { buildImagePrompt } from './prompt.ts';
import { type GenerateImage, GenerationError } from './types.ts';

/**
 * Turns a pictogram label into an image (#422). The shared handler owns auth,
 * validation and error codes; prompt.ts owns the style template; the provider
 * owns everything vendor-specific.
 */

// Exported so handler.test.ts can drive it directly without a live server.
// The generate parameter is the provider seam; tests pass a stub.
export const handleRequest = (
  req: Request,
  admin: AuthLike,
  generate: GenerateImage = generateWithAzure,
): Promise<Response> =>
  handleGenerate(req, admin, {
    failureEvent: 'generate_image_failed',
    // The prompt is built here, because the style template is app policy and
    // not provider knowledge.
    parseInput: (label) => ({ ok: true, input: buildImagePrompt(label) }),
    run: generate,
    envelopeKey: 'imageBase64',
    providerError: {
      is: (err) => err instanceof GenerationError,
      code: 'generation_failed',
      message: 'image generation failed, try again',
    },
  });

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
