import { assertEquals, assertStringIncludes } from 'std/assert';

import { handleRequest } from './index.ts';
import { buildImagePrompt } from './prompt.ts';
import { type GenerateImage, GenerationError } from './types.ts';

// The shared HTTP shell (CORS, method, auth, body and label validation) is
// covered in _shared/generateHandler.test.ts. These tests pin what is
// specific to generate-image: the envelope key, the prompt template, and the
// provider error code.

const goodAdmin = {
  auth: {
    getUser: async (_jwt: string) => ({ data: { user: { id: 'u-good' } } }),
  },
};

const request = (body: unknown): Request =>
  new Request('http://localhost/generate-image', {
    method: 'POST',
    headers: { Authorization: 'Bearer some-jwt', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

Deno.test('returns the provider image as a base64 JSON envelope on success', async () => {
  let got: string | null = null;
  const generate: GenerateImage = async (prompt) => {
    got = prompt;
    return { bytes: new Uint8Array([9, 9]), mimeType: 'image/jpeg' };
  };
  const res = await handleRequest(request({ label: ' spise ' }), goodAdmin, generate);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get('access-control-allow-origin'), '*');
  // JSON, deliberately: supabase-js reads image/* responses as text and
  // exposes no headers — see SuccessResponse in types.ts.
  assertEquals(res.headers.get('content-type'), 'application/json');
  const body = await res.json();
  assertEquals(body, { ok: true, mimeType: 'image/jpeg', imageBase64: btoa('\x09\x09') });
  // Trimmed and passed through the style template before the provider sees it.
  assertEquals(got, buildImagePrompt('spise'));
});

Deno.test('every prompt goes through the fixed style template (#422)', async () => {
  let got: string | null = null;
  const generate: GenerateImage = async (prompt) => {
    got = prompt;
    return { bytes: new Uint8Array([1]), mimeType: 'image/jpeg' };
  };
  await handleRequest(request({ label: 'i morgen' }), goodAdmin, generate);
  const prompt = got as unknown as string;
  assertStringIncludes(prompt, 'i morgen');
  assertStringIncludes(prompt, 'Flat vector illustration style');
  assertStringIncludes(prompt, 'No text');
  assertStringIncludes(prompt, "child's communication board");
  // The Danish-first declaration is load-bearing: without it the model read
  // short Danish phrases as English ("i bad" → a sad child, not a bath).
  assertStringIncludes(prompt, 'usually Danish');
  assertStringIncludes(prompt, '"i morgen"');
});

Deno.test('maps a provider failure to generation_failed without leaking detail', async () => {
  const generate: GenerateImage = async () => {
    throw new GenerationError('azure responded 401: secret detail');
  };
  const res = await handleRequest(request({ label: 'spise' }), goodAdmin, generate);
  assertEquals(res.status, 502);
  const body = await res.json();
  assertEquals(body.error, 'generation_failed');
  assertEquals(body.message.includes('secret detail'), false);
});
