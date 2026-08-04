import { assertEquals, assertStringIncludes } from 'std/assert';

import { handleRequest } from './index.ts';
import { buildImagePrompt } from './prompt.ts';
import { type GenerateImage, GenerationError } from './types.ts';

const goodAdmin = {
  auth: {
    getUser: async (_jwt: string) => ({ data: { user: { id: 'u-good' } } }),
  },
};

const noUserAdmin = {
  auth: {
    getUser: async (_jwt: string) => ({ data: { user: null } }),
  },
};

const okGenerate: GenerateImage = async (_prompt) => ({
  bytes: new Uint8Array([1, 2, 3]),
  mimeType: 'image/jpeg',
});

const request = (body: unknown, init: RequestInit = {}): Request =>
  new Request('http://localhost/generate-image', {
    method: 'POST',
    headers: { Authorization: 'Bearer some-jwt', 'content-type': 'application/json' },
    body: JSON.stringify(body),
    ...init,
  });

const errorCode = async (res: Response): Promise<string> => {
  const body = await res.json();
  return body.error;
};

Deno.test('answers the CORS preflight before any auth check (#435)', async () => {
  const res = await handleRequest(
    new Request('http://localhost/generate-image', { method: 'OPTIONS' }),
    noUserAdmin,
    okGenerate,
  );
  assertEquals(res.status, 204);
  assertEquals(res.headers.get('access-control-allow-origin'), '*');
  assertEquals(res.headers.get('access-control-allow-headers')?.includes('authorization'), true);
});

Deno.test('every response carries the CORS origin header (#435)', async () => {
  const err = await handleRequest(request({ label: '' }), goodAdmin, okGenerate);
  assertEquals(err.headers.get('access-control-allow-origin'), '*');
  const ok = await handleRequest(request({ label: 'spise' }), goodAdmin, okGenerate);
  assertEquals(ok.headers.get('access-control-allow-origin'), '*');
});

Deno.test('rejects non-POST', async () => {
  const res = await handleRequest(
    new Request('http://localhost/generate-image', { method: 'GET' }),
    goodAdmin,
    okGenerate,
  );
  assertEquals(res.status, 405);
  assertEquals(await errorCode(res), 'method_not_allowed');
});

Deno.test('rejects a missing Authorization header without an auth round-trip', async () => {
  let called = false;
  const admin = {
    auth: {
      getUser: async (_jwt: string) => {
        called = true;
        return { data: { user: { id: 'u' } } };
      },
    },
  };
  const res = await handleRequest(
    new Request('http://localhost/generate-image', {
      method: 'POST',
      body: JSON.stringify({ label: 'spise' }),
    }),
    admin,
    okGenerate,
  );
  assertEquals(res.status, 401);
  assertEquals(called, false);
});

Deno.test('rejects an invalid JWT', async () => {
  const res = await handleRequest(request({ label: 'spise' }), noUserAdmin, okGenerate);
  assertEquals(res.status, 401);
  assertEquals(await errorCode(res), 'unauthorized');
});

Deno.test('rejects a non-JSON body', async () => {
  const res = await handleRequest(
    new Request('http://localhost/generate-image', {
      method: 'POST',
      headers: { Authorization: 'Bearer j' },
      body: 'not json',
    }),
    goodAdmin,
    okGenerate,
  );
  assertEquals(res.status, 400);
  assertEquals(await errorCode(res), 'bad_request');
});

Deno.test('rejects an empty label', async () => {
  const res = await handleRequest(request({ label: '   ' }), goodAdmin, okGenerate);
  assertEquals(res.status, 400);
});

Deno.test('rejects a label over the length cap', async () => {
  const res = await handleRequest(request({ label: 'x'.repeat(61) }), goodAdmin, okGenerate);
  assertEquals(res.status, 400);
});

Deno.test('returns the provider image as a base64 JSON envelope on success', async () => {
  let got: string | null = null;
  const generate: GenerateImage = async (prompt) => {
    got = prompt;
    return { bytes: new Uint8Array([9, 9]), mimeType: 'image/jpeg' };
  };
  const res = await handleRequest(request({ label: ' spise ' }), goodAdmin, generate);
  assertEquals(res.status, 200);
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
