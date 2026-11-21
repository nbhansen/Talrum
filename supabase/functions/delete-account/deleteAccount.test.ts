import { assertEquals, assertRejects } from 'std/assert';

import { deleteAccount } from './deleteAccount.ts';
import { createFakeClient } from './fakeSupabaseClient.ts';
import { DeletionError } from './types.ts';

const UID = '11111111-1111-1111-1111-111111111111';

const authCalled = (calls: { kind: string }[]): boolean =>
  calls.some((c) => c.kind === 'auth.admin.deleteUser');

Deno.test('deleteAccount: happy path with empty buckets', async () => {
  const { client, calls } = createFakeClient();

  await deleteAccount(client, UID);

  // Each bucket gets one list (returns empty) — no removes needed — before
  // and after auth.admin.deleteUser.
  const kinds = calls.map((c) => c.kind);
  assertEquals(kinds, [
    'storage.list',
    'storage.list',
    'auth.admin.deleteUser',
    'storage.list',
    'storage.list',
  ]);
});

Deno.test('deleteAccount: audio bucket has 5 objects → list+remove called once', async () => {
  const audio = [1, 2, 3, 4, 5].map((n) => `${UID}/p${n}.mp3`);
  const { client, calls } = createFakeClient({ audio: [...audio] });

  await deleteAccount(client, UID);

  const audioRemove = calls.find(
    (c) => c.kind === 'storage.remove' && c.bucket === 'pictogram-audio',
  );
  assertEquals(audioRemove?.paths, audio);
});

Deno.test('deleteAccount: 1500 objects → list+remove looped twice', async () => {
  const { client, calls } = createFakeClient({
    audio: Array.from({ length: 1500 }, (_, i) => `${UID}/p${i}.mp3`),
  });

  const result = await deleteAccount(client, UID);

  const audioCalls = calls.filter((c) => c.bucket === 'pictogram-audio');
  // 3 lists (page1, page2, empty) + 2 removes, then 1 empty list after deleteUser
  assertEquals(audioCalls.filter((c) => c.kind === 'storage.list').length, 4);
  assertEquals(audioCalls.filter((c) => c.kind === 'storage.remove').length, 2);
  assertEquals(result.audioCount, 1500);
});

Deno.test('deleteAccount: ordering invariant — purge precedes auth call', async () => {
  const { client, calls } = createFakeClient({
    audio: [`${UID}/a.mp3`],
    images: [`${UID}/b.png`],
  });

  await deleteAccount(client, UID);

  const authIndex = calls.findIndex((c) => c.kind === 'auth.admin.deleteUser');
  const removedBeforeAuth = calls
    .slice(0, authIndex)
    .filter((c) => c.kind === 'storage.remove')
    .map((c) => c.bucket);
  assertEquals(removedBeforeAuth, ['pictogram-audio', 'pictogram-images']);
});

Deno.test(
  'deleteAccount: storage.list errors → throws storage_purge_failed; auth NOT called',
  async () => {
    const { client, calls } = createFakeClient({
      fail: (call) =>
        call.kind === 'storage.list' && call.bucket === 'pictogram-audio'
          ? { message: 'network blip' }
          : null,
    });

    const err = await assertRejects(() => deleteAccount(client, UID), DeletionError);
    assertEquals(err.code, 'storage_purge_failed');
    assertEquals(err.step, 'storage_purge_audio');
    assertEquals(authCalled(calls), false);
  },
);

Deno.test(
  'deleteAccount: storage.remove fails 3x persistent → throws after 3 retries',
  async () => {
    const { client, calls } = createFakeClient({
      audio: [`${UID}/a.mp3`],
      fail: (call) => (call.kind === 'storage.remove' ? { message: 'try again' } : null),
    });

    const err = await assertRejects(() => deleteAccount(client, UID), DeletionError);
    assertEquals(err.code, 'storage_purge_failed');
    const removeCalls = calls.filter(
      (c) => c.kind === 'storage.remove' && c.bucket === 'pictogram-audio',
    );
    assertEquals(removeCalls.length, 3);
    assertEquals(authCalled(calls), false);
  },
);

Deno.test(
  'deleteAccount: auth.admin.deleteUser returns "user not found" → resolves OK (idempotent)',
  async () => {
    const { client } = createFakeClient({ authDeleteError: { message: 'User not found' } });

    await deleteAccount(client, UID);
  },
);

Deno.test(
  'deleteAccount: auth.admin.deleteUser returns code:user_not_found → resolves OK (idempotent)',
  async () => {
    const { client } = createFakeClient({
      authDeleteError: { message: 'no such record', code: 'user_not_found' },
    });

    await deleteAccount(client, UID);
  },
);

Deno.test(
  'deleteAccount: auth.admin.deleteUser code:database_error → throws auth_delete_failed',
  async () => {
    const { client } = createFakeClient({
      authDeleteError: { message: 'connection refused', code: 'database_error' },
    });

    const err = await assertRejects(() => deleteAccount(client, UID), DeletionError);
    assertEquals(err.code, 'auth_delete_failed');
  },
);

Deno.test(
  'deleteAccount: auth.admin.deleteUser other error → throws auth_delete_failed',
  async () => {
    const { client, calls } = createFakeClient({
      audio: [`${UID}/a.mp3`],
      authDeleteError: { message: 'database is on fire' },
    });

    const err = await assertRejects(() => deleteAccount(client, UID), DeletionError);
    assertEquals(err.code, 'auth_delete_failed');
    // Storage was purged before auth attempted.
    assertEquals(
      calls.some((c) => c.kind === 'storage.remove' && c.bucket === 'pictogram-audio'),
      true,
    );
  },
);

Deno.test('deleteAccount: purges an object in a subfolder, then deletes the user', async () => {
  const { client, calls } = createFakeClient({ audio: [`${UID}/a.mp3`, `${UID}/x/y/b.mp3`] });

  const result = await deleteAccount(client, UID);

  assertEquals(result.audioCount, 2);
  assertEquals(authCalled(calls), true);
});

Deno.test('deleteAccount: purges an object that lands just before deleteUser', async () => {
  const { client, stores } = createFakeClient({ audio: [`${UID}/a.mp3`] });
  const images = stores['pictogram-images'];
  if (!images) throw new Error('fixture: no images store');
  const deleteUser = client.auth.admin.deleteUser;
  client.auth.admin.deleteUser = (uid) => {
    images.add(`${UID}/late.jpg`);
    return deleteUser(uid);
  };

  const result = await deleteAccount(client, UID);

  assertEquals(images.size, 0);
  assertEquals(result, { audioCount: 1, imageCount: 1 });
});

Deno.test('deleteAccount: a failed purge after deleteUser still resolves', async () => {
  const { client, calls } = createFakeClient({
    fail: (call, all) =>
      call.kind === 'storage.list' && authCalled(all) ? { message: 'network blip' } : null,
  });

  const result = await deleteAccount(client, UID);

  assertEquals(result, { audioCount: 0, imageCount: 0 });
  assertEquals(authCalled(calls), true);
});
