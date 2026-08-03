import { assertEquals, assertStringIncludes } from 'std/assert';

import { buildSsml } from './azure.ts';
import { handleRequest } from './index.ts';
import { SynthesisError, type Synthesize } from './types.ts';

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

const okSynth: Synthesize = async (_label, _language) => ({
  bytes: new Uint8Array([1, 2, 3]),
  mimeType: 'audio/mpeg',
});

const request = (body: unknown, init: RequestInit = {}): Request =>
  new Request('http://localhost/generate-voice', {
    method: 'POST',
    headers: { Authorization: 'Bearer some-jwt', 'content-type': 'application/json' },
    body: JSON.stringify(body),
    ...init,
  });

const errorCode = async (res: Response): Promise<string> => {
  const body = await res.json();
  return body.error;
};

Deno.test('rejects non-POST', async () => {
  const res = await handleRequest(
    new Request('http://localhost/generate-voice', { method: 'GET' }),
    goodAdmin,
    okSynth,
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
    new Request('http://localhost/generate-voice', {
      method: 'POST',
      body: JSON.stringify({ label: 'spise', language: 'da' }),
    }),
    admin,
    okSynth,
  );
  assertEquals(res.status, 401);
  assertEquals(called, false);
});

Deno.test('rejects an invalid JWT', async () => {
  const res = await handleRequest(
    request({ label: 'spise', language: 'da' }),
    noUserAdmin,
    okSynth,
  );
  assertEquals(res.status, 401);
  assertEquals(await errorCode(res), 'unauthorized');
});

Deno.test('rejects a non-JSON body', async () => {
  const res = await handleRequest(
    new Request('http://localhost/generate-voice', {
      method: 'POST',
      headers: { Authorization: 'Bearer j' },
      body: 'not json',
    }),
    goodAdmin,
    okSynth,
  );
  assertEquals(res.status, 400);
  assertEquals(await errorCode(res), 'bad_request');
});

Deno.test('rejects an empty label', async () => {
  const res = await handleRequest(request({ label: '   ', language: 'da' }), goodAdmin, okSynth);
  assertEquals(res.status, 400);
});

Deno.test('rejects a label over the length cap', async () => {
  const res = await handleRequest(
    request({ label: 'x'.repeat(61), language: 'da' }),
    goodAdmin,
    okSynth,
  );
  assertEquals(res.status, 400);
});

Deno.test('rejects a language outside the closed set', async () => {
  const res = await handleRequest(request({ label: 'spise', language: 'xx' }), goodAdmin, okSynth);
  assertEquals(res.status, 400);
});

Deno.test('returns the provider clip as a base64 JSON envelope on success', async () => {
  let got: { label: string; language: string } | null = null;
  const synth: Synthesize = async (label, language) => {
    got = { label, language };
    return { bytes: new Uint8Array([9, 9]), mimeType: 'audio/mpeg' };
  };
  const res = await handleRequest(request({ label: ' spise ', language: 'da' }), goodAdmin, synth);
  assertEquals(res.status, 200);
  // JSON, deliberately: supabase-js reads audio/* responses as text and
  // exposes no headers — see SuccessResponse in types.ts.
  assertEquals(res.headers.get('content-type'), 'application/json');
  const body = await res.json();
  assertEquals(body, { ok: true, mimeType: 'audio/mpeg', audioBase64: btoa('\x09\x09') });
  // Trimmed before the provider sees it.
  assertEquals(got, { label: 'spise', language: 'da' });
});

Deno.test('maps a provider failure to synthesis_failed without leaking detail', async () => {
  const synth: Synthesize = async () => {
    throw new SynthesisError('azure responded 401: secret detail');
  };
  const res = await handleRequest(request({ label: 'spise', language: 'da' }), goodAdmin, synth);
  assertEquals(res.status, 502);
  const body = await res.json();
  assertEquals(body.error, 'synthesis_failed');
  assertEquals(body.message.includes('secret detail'), false);
});

Deno.test('buildSsml escapes label content so input cannot alter the SSML', () => {
  const ssml = buildSsml(`<voice name="x">&'"`, 'da');
  assertStringIncludes(ssml, '&lt;voice name=&quot;x&quot;&gt;&amp;&apos;&quot;');
  assertEquals(ssml.includes('<voice name="x">'), false);
});

Deno.test('buildSsml picks the Danish neural voice for da', () => {
  assertStringIncludes(buildSsml('spise', 'da'), 'da-DK-ChristelNeural');
  assertStringIncludes(buildSsml('spise', 'da'), 'xml:lang="da-DK"');
});
