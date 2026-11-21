import { assertEquals } from 'std/assert';

import type { AuthLike } from '../_shared/http.ts';
import { handleRequest } from './index.ts';
import { DeletionError } from './types.ts';

const noopDelete = async (_uid: string) => ({ audioCount: 0, imageCount: 0 });

const goodAdmin: AuthLike = {
  auth: { getUser: async () => ({ data: { user: { id: 'u-good' } } }) },
};

const noUserAdmin: AuthLike = {
  auth: { getUser: async () => ({ data: { user: null } }) },
};

const countingAdmin = (): { admin: AuthLike; getUserCalls: () => number } => {
  let calls = 0;
  return {
    admin: {
      auth: {
        getUser: async () => {
          calls += 1;
          return { data: { user: null } };
        },
      },
    },
    getUserCalls: () => calls,
  };
};

const post = (body = '', auth: string | null = 'Bearer good.jwt.value'): Request =>
  new Request('https://x.invalid/delete-account', {
    method: 'POST',
    headers: auth === null ? {} : { Authorization: auth },
    body,
  });

Deno.test('handler: valid POST + valid Bearer → 200 { ok: true }', async () => {
  const res = await handleRequest(post(), goodAdmin, noopDelete);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body, { ok: true });
});

Deno.test('handler: no Authorization header → 401 without calling admin.auth.getUser', async () => {
  const { admin, getUserCalls } = countingAdmin();
  const res = await handleRequest(post('', null), admin, noopDelete);
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.ok, false);
  assertEquals(body.error, 'unauthorized');
  assertEquals(getUserCalls(), 0);
});

Deno.test('handler: invalid Bearer → 401 unauthorized', async () => {
  const res = await handleRequest(post('', 'Bearer not.a.real.jwt'), noUserAdmin, noopDelete);
  assertEquals(res.status, 401);
});

Deno.test(
  'handler: replayed JWT after the account is gone → 401 without re-running deletion (#217)',
  async () => {
    let deleteCalls = 0;
    const deleteFn = async (uid: string) => {
      deleteCalls += 1;
      return noopDelete(uid);
    };
    const res = await handleRequest(
      post('', 'Bearer once.valid.now.deleted'),
      noUserAdmin,
      deleteFn,
    );
    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.ok, false);
    assertEquals(body.error, 'unauthorized');
    assertEquals(deleteCalls, 0);
  },
);

Deno.test('handler: non-empty body → 400 bad_request', async () => {
  const res = await handleRequest(post('{"user_id":"someone-else"}'), goodAdmin, noopDelete);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, 'bad_request');
});

Deno.test('handler: GET → 405 method_not_allowed', async () => {
  const req = new Request('https://x.invalid/delete-account', { method: 'GET' });
  const res = await handleRequest(req, goodAdmin, noopDelete);
  assertEquals(res.status, 405);
  const body = await res.json();
  assertEquals(body.error, 'method_not_allowed');
});

Deno.test('handler: OPTIONS preflight → 204 with CORS headers, no auth check (#435)', async () => {
  const req = new Request('https://x.invalid/delete-account', { method: 'OPTIONS' });
  const res = await handleRequest(req, goodAdmin, noopDelete);
  assertEquals(res.status, 204);
  assertEquals(res.headers.get('access-control-allow-origin'), '*');
});

Deno.test('handler: responses carry the CORS origin header (#435)', async () => {
  const req = new Request('https://x.invalid/delete-account', { method: 'GET' });
  const res = await handleRequest(req, goodAdmin, noopDelete);
  assertEquals(res.headers.get('access-control-allow-origin'), '*');
});

Deno.test('handler: DeletionError storage_purge_failed → 500 with code', async () => {
  const failingDelete = async (_uid: string): Promise<never> => {
    throw new DeletionError('storage_purge_failed', 'storage_purge_audio', 'simulated');
  };
  const res = await handleRequest(post(), goodAdmin, failingDelete);
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error, 'storage_purge_failed');
});

Deno.test('handler: unanticipated error → 500 internal_error', async () => {
  const explodingDelete = async (_uid: string): Promise<never> => {
    throw new Error('random thing');
  };
  const res = await handleRequest(post(), goodAdmin, explodingDelete);
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error, 'internal_error');
});

Deno.test('handler: malformed Authorization → 401 without calling admin.auth.getUser', async () => {
  const cases = [
    'bearer x.y.z', // wrong case on scheme
    'x.y.z', // no scheme at all
    'Basic abc:def', // wrong scheme
    'Bearer ', // scheme present but empty token
  ];
  for (const authHeader of cases) {
    const { admin, getUserCalls } = countingAdmin();
    const res = await handleRequest(post('', authHeader), admin, noopDelete);
    assertEquals(res.status, 401, `auth header: ${authHeader}`);
    const body = await res.json();
    assertEquals(body.error, 'unauthorized');
    assertEquals(getUserCalls(), 0, `getUser should not be called for header: ${authHeader}`);
  }
});

Deno.test('handler: empty {} body is accepted (matches supabase-js invoke shape)', async () => {
  const res = await handleRequest(post('{}'), goodAdmin, noopDelete);
  assertEquals(res.status, 200);
});
