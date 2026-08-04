/**
 * The Azure implementation of the GenerateImage seam. This file is the only
 * place in the repository that knows Azure exists. It sends the prompt to an
 * image model deployed on Azure OpenAI and returns JPEG bytes.
 *
 * Secrets (set with `supabase secrets set`):
 *   AZURE_OPENAI_KEY              — the key from the Azure OpenAI resource page.
 *   AZURE_OPENAI_ENDPOINT         — the resource URL (https://<name>.openai.azure.com).
 *   AZURE_OPENAI_IMAGE_DEPLOYMENT — the deployment name typed when deploying
 *                                   the image model (gpt-image-1).
 */

import { type GenerateImage, GenerationError } from './types.ts';

const API_VERSION = '2025-04-01-preview';

/**
 * Fixed request shape, on purpose: a generated pictogram becomes part of a
 * learned symbol system, so every generation must come from the same model
 * settings. Square is the shape the client crops to anyway; medium quality
 * is enough for flat 512px pictograms; JPEG because the client re-encodes
 * to JPEG and the transfer is smaller.
 */
const IMAGE_REQUEST = {
  size: '1024x1024',
  quality: 'medium',
  n: 1,
  output_format: 'jpeg',
  output_compression: 90,
} as const;

export const generateWithAzure: GenerateImage = async (prompt) => {
  const key = Deno.env.get('AZURE_OPENAI_KEY');
  const endpoint = Deno.env.get('AZURE_OPENAI_ENDPOINT');
  const deployment = Deno.env.get('AZURE_OPENAI_IMAGE_DEPLOYMENT');
  if (!key || !endpoint || !deployment) {
    throw new GenerationError(
      'AZURE_OPENAI_KEY, AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_IMAGE_DEPLOYMENT must be set',
    );
  }

  const url = `${endpoint.replace(/\/$/, '')}/openai/deployments/${deployment}/images/generations?api-version=${API_VERSION}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'api-key': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, ...IMAGE_REQUEST }),
      // Image generation is slow (tens of seconds). Without a timeout a
      // stalled connection hangs until the platform kills the function
      // while the tab sits disabled on "Generating…".
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    throw new GenerationError(
      `azure fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok) {
    // Status and request id only — never the body. An upstream error can
    // echo the prompt, which contains the label, and index.ts logs this
    // message; the privacy policy's "we do not log the label" must stay
    // unconditionally true. The request id is what Azure support asks for.
    const requestId = res.headers.get('apim-request-id') ?? 'unknown';
    throw new GenerationError(`azure responded ${res.status} (request ${requestId})`);
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw new GenerationError('azure returned a non-JSON body');
  }
  const b64 = (payload as { data?: { b64_json?: unknown }[] }).data?.[0]?.b64_json;
  if (typeof b64 !== 'string' || b64.length === 0) {
    throw new GenerationError('azure returned no image data');
  }
  // Decode here so a malformed payload fails inside the provider, mapped to
  // generation_failed, instead of surfacing as internal_error in the shell.
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch {
    throw new GenerationError('azure returned invalid base64 image data');
  }
  return { bytes, mimeType: 'image/jpeg' };
};
