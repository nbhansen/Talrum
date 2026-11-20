import { assertEquals } from 'std/assert';

import {
  type AuthLike,
  type GenerateConfig,
  type GenerateInput,
  handleGenerate,
  MAX_LABEL_LENGTH,
  NotConfiguredError,
  ProviderError,
} from './generateHandler.ts';

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

const config = (
  overrides: Partial<GenerateConfig<'provider_failed'>> = {},
): GenerateConfig<'provider_failed'> => ({
  failureEvent: 'stub_failed',
  run: async () => ({ bytes: new Uint8Array([9, 9]), mimeType: 'stub/type' }),
  envelopeKey: 'imageBase64',
  providerCode: 'provider_failed',
  providerMessage: 'provider failed, try again',
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
  const ok = await handleGenerate(request({ label: 'spise', language: 'da' }), goodAdmin, config());
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
      body: JSON.stringify({ label: 'spise', language: 'da' }),
    }),
    admin,
    config(),
  );
  assertEquals(res.status, 401);
  assertEquals(called, false);
});

Deno.test('rejects an invalid JWT', async () => {
  const res = await handleGenerate(
    request({ label: 'spise', language: 'da' }),
    noUserAdmin,
    config(),
  );
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

Deno.test('rejects a missing language or one outside the closed set', async () => {
  for (const body of [{ label: 'spise' }, { label: 'spise', language: 'fr' }]) {
    const res = await handleGenerate(request(body), goodAdmin, config());
    assertEquals(res.status, 400);
    assertEquals(await res.json(), {
      ok: false,
      error: 'bad_request',
      message: 'language must be one of: da, en',
    });
  }
});

Deno.test('trims the label and returns the media under the configured envelope key', async () => {
  let got: GenerateInput | null = null;
  const res = await handleGenerate(
    request({ label: ' spise ', language: 'en' }),
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
  assertEquals(got, { label: 'spise', language: 'en' });
});

Deno.test('maps a provider failure to the configured code without leaking detail', async () => {
  const res = await handleGenerate(
    request({ label: 'spise', language: 'da' }),
    goodAdmin,
    config({
      run: async () => {
        throw new ProviderError('upstream responded 401: secret detail');
      },
    }),
  );
  assertEquals(res.status, 502);
  const body = await res.json();
  assertEquals(body.error, 'provider_failed');
  assertEquals(body.message.includes('secret detail'), false);
});

Deno.test('maps a provider with no credentials to not_configured (#687)', async () => {
  const res = await handleGenerate(
    request({ label: 'spise', language: 'da' }),
    goodAdmin,
    config({
      run: async () => {
        throw new NotConfiguredError('STUB_KEY must be set');
      },
    }),
  );
  assertEquals(res.status, 503);
  assertEquals(await errorCode(res), 'not_configured');
});

Deno.test('maps any other throw to internal_error', async () => {
  const res = await handleGenerate(
    request({ label: 'spise', language: 'da' }),
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
