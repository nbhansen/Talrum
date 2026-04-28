import { assertEquals, assertRejects } from 'std/assert';

import { deleteAccount } from './deleteAccount.ts';
import { createFakeClient } from './fakeSupabaseClient.ts';
import { DeletionError } from './types.ts';

const UID = '11111111-1111-1111-1111-111111111111';

Deno.test('deleteAccount: happy path with empty buckets', async () => {
  const { client, calls } = createFakeClient({
    buckets: {
      'pictogram-audio': { listResponses: [{ data: [] }], removeResponses: [] },
      'pictogram-images': { listResponses: [{ data: [] }], removeResponses: [] },
    },
    authDelete: { ok: true },
  });

  await deleteAccount(client, UID);

  // Each bucket gets one list (returns empty) — no removes needed.
  // Then auth.admin.deleteUser is called.
  const kinds = calls.map((c) => c.kind);
  assertEquals(kinds, ['storage.list', 'storage.list', 'auth.admin.deleteUser']);
});

Deno.test('deleteAccount: audio bucket has 5 objects → list+remove called once', async () => {
  const audioObjects = [
    { name: 'p1.mp3' },
    { name: 'p2.mp3' },
    { name: 'p3.mp3' },
    { name: 'p4.mp3' },
    { name: 'p5.mp3' },
  ];
  const { client, calls } = createFakeClient({
    buckets: {
      'pictogram-audio': {
        listResponses: [{ data: audioObjects }, { data: [] }],
        removeResponses: [{ data: audioObjects }],
      },
      'pictogram-images': { listResponses: [{ data: [] }], removeResponses: [] },
    },
    authDelete: { ok: true },
  });

  await deleteAccount(client, UID);

  // Find the remove call for audio.
  const audioRemove = calls.find(
    (c) => c.kind === 'storage.remove' && c.bucket === 'pictogram-audio',
  );
  assertEquals(audioRemove?.paths, [
    `${UID}/p1.mp3`,
    `${UID}/p2.mp3`,
    `${UID}/p3.mp3`,
    `${UID}/p4.mp3`,
    `${UID}/p5.mp3`,
  ]);
});

Deno.test('deleteAccount: 1500 objects → list+remove looped twice', async () => {
  const page1 = Array.from({ length: 1000 }, (_, i) => ({ name: `p${i}.mp3` }));
  const page2 = Array.from({ length: 500 }, (_, i) => ({ name: `p${1000 + i}.mp3` }));
  const { client, calls } = createFakeClient({
    buckets: {
      'pictogram-audio': {
        listResponses: [{ data: page1 }, { data: page2 }, { data: [] }],
        removeResponses: [{ data: page1 }, { data: page2 }],
      },
      'pictogram-images': { listResponses: [{ data: [] }], removeResponses: [] },
    },
    authDelete: { ok: true },
  });

  const result = await deleteAccount(client, UID);

  const audioCalls = calls.filter((c) => c.bucket === 'pictogram-audio');
  // 3 lists (page1, page2, empty) + 2 removes
  assertEquals(audioCalls.filter((c) => c.kind === 'storage.list').length, 3);
  assertEquals(audioCalls.filter((c) => c.kind === 'storage.remove').length, 2);
  assertEquals(result.audioCount, 1500);
});

Deno.test('deleteAccount: ordering invariant — all storage calls precede auth call', async () => {
  const { client, calls } = createFakeClient({
    buckets: {
      'pictogram-audio': {
        listResponses: [{ data: [{ name: 'a.mp3' }] }, { data: [] }],
        removeResponses: [{ data: [] }],
      },
      'pictogram-images': {
        listResponses: [{ data: [{ name: 'b.png' }] }, { data: [] }],
        removeResponses: [{ data: [] }],
      },
    },
    authDelete: { ok: true },
  });

  await deleteAccount(client, UID);

  const authIndex = calls.findIndex((c) => c.kind === 'auth.admin.deleteUser');
  const lastStorageIndex = calls.findLastIndex(
    (c) => c.kind === 'storage.list' || c.kind === 'storage.remove',
  );
  // auth.admin.deleteUser must come after the last storage call.
  if (authIndex <= lastStorageIndex) {
    throw new Error(
      `Ordering invariant violated: auth at ${authIndex}, last storage at ${lastStorageIndex}`,
    );
  }
});

Deno.test(
  'deleteAccount: storage.list errors → throws storage_purge_failed; auth NOT called',
  async () => {
    const { client, calls } = createFakeClient({
      buckets: {
        'pictogram-audio': {
          listResponses: [{ error: { message: 'network blip' } }],
          removeResponses: [],
        },
        'pictogram-images': { listResponses: [{ data: [] }], removeResponses: [] },
      },
      authDelete: { ok: true },
    });

    const err = await assertRejects(() => deleteAccount(client, UID), DeletionError);
    assertEquals(err.code, 'storage_purge_failed');
    assertEquals(err.step, 'storage_purge_audio');
    assertEquals(
      calls.some((c) => c.kind === 'auth.admin.deleteUser'),
      false,
    );
  },
);

Deno.test(
  'deleteAccount: storage.remove fails 3x persistent → throws after 3 retries',
  async () => {
    const obj = [{ name: 'a.mp3' }];
    const { client, calls } = createFakeClient({
      buckets: {
        'pictogram-audio': {
          listResponses: [{ data: obj }],
          removeResponses: [
            { error: { message: 'try 1' } },
            { error: { message: 'try 2' } },
            { error: { message: 'try 3' } },
          ],
        },
        'pictogram-images': { listResponses: [{ data: [] }], removeResponses: [] },
      },
      authDelete: { ok: true },
    });

    const err = await assertRejects(() => deleteAccount(client, UID), DeletionError);
    assertEquals(err.code, 'storage_purge_failed');
    // Exactly 3 remove attempts on the audio bucket.
    const removeCalls = calls.filter(
      (c) => c.kind === 'storage.remove' && c.bucket === 'pictogram-audio',
    );
    assertEquals(removeCalls.length, 3);
    assertEquals(
      calls.some((c) => c.kind === 'auth.admin.deleteUser'),
      false,
    );
  },
);

Deno.test(
  'deleteAccount: auth.admin.deleteUser returns "user not found" → resolves OK (idempotent)',
  async () => {
    const { client } = createFakeClient({
      buckets: {
        'pictogram-audio': { listResponses: [{ data: [] }], removeResponses: [] },
        'pictogram-images': { listResponses: [{ data: [] }], removeResponses: [] },
      },
      authDelete: { error: { message: 'User not found' } },
    });

    // Should resolve, not throw.
    await deleteAccount(client, UID);
  },
);

Deno.test(
  'deleteAccount: auth.admin.deleteUser returns code:user_not_found → resolves OK (idempotent)',
  async () => {
    const { client } = createFakeClient({
      buckets: {
        'pictogram-audio': { listResponses: [{ data: [] }], removeResponses: [] },
        'pictogram-images': { listResponses: [{ data: [] }], removeResponses: [] },
      },
      authDelete: {
        error: { message: 'no such record', code: 'user_not_found' },
      },
    });

    // Should resolve, not throw.
    await deleteAccount(client, UID);
  },
);

Deno.test(
  'deleteAccount: auth.admin.deleteUser code:database_error → throws auth_delete_failed',
  async () => {
    const { client } = createFakeClient({
      buckets: {
        'pictogram-audio': { listResponses: [{ data: [] }], removeResponses: [] },
        'pictogram-images': { listResponses: [{ data: [] }], removeResponses: [] },
      },
      authDelete: {
        error: { message: 'connection refused', code: 'database_error' },
      },
    });

    const err = await assertRejects(() => deleteAccount(client, UID), DeletionError);
    assertEquals(err.code, 'auth_delete_failed');
  },
);

Deno.test(
  'deleteAccount: auth.admin.deleteUser other error → throws auth_delete_failed',
  async () => {
    const { client, calls } = createFakeClient({
      buckets: {
        'pictogram-audio': {
          listResponses: [{ data: [{ name: 'a.mp3' }] }, { data: [] }],
          removeResponses: [{ data: [] }],
        },
        'pictogram-images': { listResponses: [{ data: [] }], removeResponses: [] },
      },
      authDelete: { error: { message: 'database is on fire' } },
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
