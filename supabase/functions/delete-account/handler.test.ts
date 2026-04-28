import { assertEquals } from 'std/assert';

import { handleRequest } from './index.ts';

// Stub admin client used by the handler for auth.getUser.
// Returns a configurable user (or error) per test.
interface Authed {
  id: string;
}

const noopDelete = async (_uid: string): Promise<void> => {
  // intentional no-op: handler stub for happy-path tests.
};

const makeAdminStub = (
  override: Partial<{
    getUser: (
      jwt: string | undefined,
    ) => Promise<{ data: { user: Authed | null }; error: unknown }>;
    deleteImpl: (uid: string) => Promise<void>;
  }>,
) => ({
  auth: {
    getUser: override.getUser ?? (async () => ({ data: { user: { id: 'u-good' } }, error: null })),
  },
  // The handler calls deleteAccount() with this client; we stub it as a no-op
  // unless the test wants to simulate a deletion failure.
  __deleteImpl: override.deleteImpl ?? noopDelete,
});

Deno.test('handler: valid POST + valid Bearer → 200 { ok: true }', async () => {
  const req = new Request('https://x.invalid/delete-account', {
    method: 'POST',
    headers: { Authorization: 'Bearer good.jwt.value' },
    body: '',
  });
  const admin = makeAdminStub({});
  const res = await handleRequest(req, admin);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body, { ok: true });
});

Deno.test('handler: no Authorization header → 401 unauthorized', async () => {
  const req = new Request('https://x.invalid/delete-account', { method: 'POST', body: '' });
  const admin = makeAdminStub({
    getUser: async () => ({ data: { user: null }, error: { message: 'no jwt' } }),
  });
  const res = await handleRequest(req, admin);
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.ok, false);
  assertEquals(body.error, 'unauthorized');
});

Deno.test('handler: invalid Bearer → 401 unauthorized', async () => {
  const req = new Request('https://x.invalid/delete-account', {
    method: 'POST',
    headers: { Authorization: 'Bearer not.a.real.jwt' },
    body: '',
  });
  const admin = makeAdminStub({
    getUser: async () => ({ data: { user: null }, error: { message: 'invalid jwt' } }),
  });
  const res = await handleRequest(req, admin);
  assertEquals(res.status, 401);
});

Deno.test('handler: non-empty body → 400 bad_request', async () => {
  const req = new Request('https://x.invalid/delete-account', {
    method: 'POST',
    headers: { Authorization: 'Bearer good.jwt.value' },
    body: '{"user_id":"someone-else"}',
  });
  const admin = makeAdminStub({});
  const res = await handleRequest(req, admin);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, 'bad_request');
});

Deno.test('handler: GET → 405 method_not_allowed', async () => {
  const req = new Request('https://x.invalid/delete-account', { method: 'GET' });
  const admin = makeAdminStub({});
  const res = await handleRequest(req, admin);
  assertEquals(res.status, 405);
  const body = await res.json();
  assertEquals(body.error, 'method_not_allowed');
});

Deno.test('handler: DeletionError storage_purge_failed → 500 with code', async () => {
  const req = new Request('https://x.invalid/delete-account', {
    method: 'POST',
    headers: { Authorization: 'Bearer good.jwt.value' },
    body: '',
  });
  const admin = makeAdminStub({
    deleteImpl: async () => {
      const { DeletionError } = await import('./types.ts');
      throw new DeletionError('storage_purge_failed', 'storage_purge_audio', 'simulated');
    },
  });
  const res = await handleRequest(req, admin);
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error, 'storage_purge_failed');
});

Deno.test('handler: unanticipated error → 500 internal_error', async () => {
  const req = new Request('https://x.invalid/delete-account', {
    method: 'POST',
    headers: { Authorization: 'Bearer good.jwt.value' },
    body: '',
  });
  const admin = makeAdminStub({
    deleteImpl: async () => {
      throw new Error('random thing');
    },
  });
  const res = await handleRequest(req, admin);
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error, 'internal_error');
});

Deno.test('handler: empty {} body is accepted (matches supabase-js invoke shape)', async () => {
  const req = new Request('https://x.invalid/delete-account', {
    method: 'POST',
    headers: { Authorization: 'Bearer good.jwt.value' },
    body: '{}',
  });
  const admin = makeAdminStub({});
  const res = await handleRequest(req, admin);
  assertEquals(res.status, 200);
});
