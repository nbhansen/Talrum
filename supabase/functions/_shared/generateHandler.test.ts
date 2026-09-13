import { assertEquals } from 'std/assert';

import {
  type AuthLike,
  type GenerateConfig,
  handleGenerate,
  MAX_LABEL_LENGTH,
} from './generateHandler.ts';

class StubProviderError extends Error {}

const goodAdmin: AuthLike = {
  auth: {
    getUser: async (_jwt: string) => ({ data: { user: { id: 'u-good' } } }),
  },
};

const noUserAdmin: AuthLike = {
  auth: {
    getUser: async (_jwt: string) => ({ data: { user: null } }),
  },
};

const config = (overrides: Partial<GenerateConfig<string>> = {}): GenerateConfig<string> => ({
  failureEvent: 'stub_failed',
  parseInput: (label) => ({ ok: true, input: label }),
  run: async () => ({ bytes: new Uint8Array([9, 9]), mimeType: 'stub/type' }),
  envelopeKey: 'imageBase64',
  providerError: {
    is: (err) => err instanceof StubProviderError,
    code: 'provider_failed',
    message: 'provider failed, try again',
  },
  ...overrides,
});

const request = (body: unknown, init: RequestInit = {}): Request =>
  new Request('http://localhost/generate-stub', {
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
  const res = await handleGenerate(
    new Request('http://localhost/generate-stub', { method: 'OPTIONS' }),
    noUserAdmin,
    config(),
  );
  assertEquals(res.status, 204);
  assertEquals(res.headers.get('access-control-allow-origin'), '*');
  assertEquals(res.headers.get('access-control-allow-headers')?.includes('authorization'), true);
});

Deno.test('every response carries the CORS origin header (#435)', async () => {
  const err = await handleGenerate(request({ label: '' }), goodAdmin, config());
  assertEquals(err.headers.get('access-control-allow-origin'), '*');
  const ok = await handleGenerate(request({ label: 'spise' }), goodAdmin, config());
  assertEquals(ok.headers.get('access-control-allow-origin'), '*');
});

Deno.test('rejects non-POST', async () => {
  const res = await handleGenerate(
    new Request('http://localhost/generate-stub', { method: 'GET' }),
    goodAdmin,
    config(),
  );
  assertEquals(res.status, 405);
  assertEquals(await errorCode(res), 'method_not_allowed');
});

Deno.test('rejects a missing Authorization header without an auth round-trip', async () => {
  let called = false;
  const admin: AuthLike = {
    auth: {
      getUser: async (_jwt: string) => {
        called = true;
        return { data: { user: { id: 'u' } } };
      },
    },
  };
  const res = await handleGenerate(
    new Request('http://localhost/generate-stub', {
      method: 'POST',
      body: JSON.stringify({ label: 'spise' }),
    }),
    admin,
    config(),
  );
  assertEquals(res.status, 401);
  assertEquals(called, false);
});

Deno.test('rejects an invalid JWT', async () => {
  const res = await handleGenerate(request({ label: 'spise' }), noUserAdmin, config());
  assertEquals(res.status, 401);
  assertEquals(await errorCode(res), 'unauthorized');
});

Deno.test('rejects a non-JSON body', async () => {
  const res = await handleGenerate(
    new Request('http://localhost/generate-stub', {
      method: 'POST',
      headers: { Authorization: 'Bearer j' },
      body: 'not json',
    }),
    goodAdmin,
    config(),
  );
  assertEquals(res.status, 400);
  assertEquals(await errorCode(res), 'bad_request');
});

Deno.test('rejects an empty label', async () => {
  const res = await handleGenerate(request({ label: '   ' }), goodAdmin, config());
  assertEquals(res.status, 400);
});

Deno.test('rejects a label over the length cap', async () => {
  const res = await handleGenerate(
    request({ label: 'x'.repeat(MAX_LABEL_LENGTH + 1) }),
    goodAdmin,
    config(),
  );
  assertEquals(res.status, 400);
});

Deno.test('rejects when parseInput rejects, with its message', async () => {
  const res = await handleGenerate(
    request({ label: 'spise' }),
    goodAdmin,
    config({ parseInput: () => ({ ok: false, message: 'nope' }) }),
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body, { ok: false, error: 'bad_request', message: 'nope' });
});

Deno.test('trims the label and returns the media under the configured envelope key', async () => {
  let got: string | null = null;
  const res = await handleGenerate(
    request({ label: ' spise ' }),
    goodAdmin,
    config({
      envelopeKey: 'audioBase64',
      run: async (input) => {
        got = input;
        return { bytes: new Uint8Array([9, 9]), mimeType: 'stub/type' };
      },
    }),
  );
  assertEquals(res.status, 200);
  assertEquals(res.headers.get('content-type'), 'application/json');
  const body = await res.json();
  assertEquals(body, { ok: true, mimeType: 'stub/type', audioBase64: btoa('\x09\x09') });
  assertEquals(got, 'spise');
});

Deno.test('maps a provider failure to the configured code without leaking detail', async () => {
  const res = await handleGenerate(
    request({ label: 'spise' }),
    goodAdmin,
    config({
      run: async () => {
        throw new StubProviderError('upstream responded 401: secret detail');
      },
    }),
  );
  assertEquals(res.status, 502);
  const body = await res.json();
  assertEquals(body.error, 'provider_failed');
  assertEquals(body.message.includes('secret detail'), false);
});

Deno.test('maps any other throw to internal_error', async () => {
  const res = await handleGenerate(
    request({ label: 'spise' }),
    goodAdmin,
    config({
      run: async () => {
        throw new Error('boom');
      },
    }),
  );
  assertEquals(res.status, 500);
  assertEquals(await errorCode(res), 'internal_error');
});
