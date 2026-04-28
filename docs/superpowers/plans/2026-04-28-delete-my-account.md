# Delete-my-account flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a complete, GDPR-defensible "Delete my account" flow for Talrum (issue #100), including FK-cascade prerequisite migration, edge-function executor, typed-phrase confirmation UI, integration tests, privacy policy, and operator runbook.

**Architecture:** Single Supabase Edge Function (`delete-account`) owns the deletion sequence end-to-end: verify JWT → purge storage objects in both buckets → delete `auth.users` row (cascades to app tables via FKs added in a prerequisite migration). React UI in `SettingsRoute` opens a typed-phrase confirmation dialog that fires a TanStack mutation against the function. Privacy policy and runbook ship as docs alongside the engineering work.

**Tech Stack:** TypeScript + React 18 + react-router-dom 6 + TanStack Query + Vite (client), Supabase Edge Functions / Deno (server), Postgres / Supabase Auth / Supabase Storage (data), Vitest + RTL (client tests), Deno test runner (server tests), pgTAP via `supabase test db` (schema tests), shell + curl (E2E integration test), GitHub Actions (CI/CD).

**Spec:** `docs/superpowers/specs/2026-04-28-delete-my-account-design.md` (read this first for design decisions and rationale).

---

## Conventions used in this plan

- **TDD:** every code-producing task writes the test first, runs it to confirm it fails, then writes the minimal implementation, then runs it to confirm it passes, then commits.
- **Frequent commits:** each task ends with one commit. Commit messages follow Conventional Commits with a short reason.
- **Run from repo root** unless a step specifies otherwise.
- **Local Supabase must be running** for any task that touches `supabase test db`, `supabase functions serve`, or the integration test. Start it with `supabase start` before those tasks.
- **No drive-by edits:** if a pre-existing bug surfaces during a task, file it via `gh issue create` (per spec § "Bugs encountered during implementation") and continue. Do not bundle.

---

## Phase A — Prerequisite: FK cascade migration

### Task 1: pgTAP test asserting FK cascades exist with ON DELETE CASCADE

**Files:**
- Create: `supabase/tests/owner_fk_cascades_test.sql`

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/owner_fk_cascades_test.sql`:

```sql
-- Pins the FK-cascade contract introduced for issue #100 (delete-my-account).
-- Without this, a future migration could drop or weaken the cascade and the
-- regression would only surface when a deletion fails to clean up app rows.
--
-- Run with: supabase test db
BEGIN;
SELECT plan(8);

-- Existence assertions: each app-table column referencing auth.users has a FK.
SELECT has_fk('public', 'kids',          'kids has at least one foreign key');
SELECT has_fk('public', 'pictograms',    'pictograms has at least one foreign key');
SELECT has_fk('public', 'boards',        'boards has at least one foreign key');
SELECT has_fk('public', 'board_members', 'board_members has at least one foreign key');

-- Cascade-action assertions: each owner FK is ON DELETE CASCADE.
SELECT is(
  (SELECT confdeltype FROM pg_constraint WHERE conname = 'kids_owner_id_fkey'),
  'c'::"char",
  'kids_owner_id_fkey is ON DELETE CASCADE'
);
SELECT is(
  (SELECT confdeltype FROM pg_constraint WHERE conname = 'pictograms_owner_id_fkey'),
  'c'::"char",
  'pictograms_owner_id_fkey is ON DELETE CASCADE'
);
SELECT is(
  (SELECT confdeltype FROM pg_constraint WHERE conname = 'boards_owner_id_fkey'),
  'c'::"char",
  'boards_owner_id_fkey is ON DELETE CASCADE'
);
SELECT is(
  (SELECT confdeltype FROM pg_constraint WHERE conname = 'board_members_user_id_fkey'),
  'c'::"char",
  'board_members_user_id_fkey is ON DELETE CASCADE'
);

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `supabase test db`
Expected: 4 of the 8 assertions FAIL — the four `confdeltype` lookups return NULL because the constraints don't exist yet. The 4 `has_fk` calls pass (boards has `kid_id` FK; board_members has `board_id` FK).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/<NEW_TIMESTAMP>_add_owner_fk_cascades.sql` (use the current UTC timestamp `YYYYMMDDHHMMSS`; you can generate one via `date -u +%Y%m%d%H%M%S`):

```sql
-- Adds the missing FK cascades from app tables to auth.users.
-- Required by issue #100 (delete-my-account) so that auth.users deletion
-- cleans up all owner-scoped app rows in one atomic step.
--
-- Pre-launch context: cloud has no real users yet, so default validation
-- is safe. If a future replay against populated data finds orphans, the
-- ALTER fails — by design — surfacing them for cleanup before deploy.

alter table public.kids
  add constraint kids_owner_id_fkey
  foreign key (owner_id) references auth.users(id) on delete cascade;

alter table public.pictograms
  add constraint pictograms_owner_id_fkey
  foreign key (owner_id) references auth.users(id) on delete cascade;

alter table public.boards
  add constraint boards_owner_id_fkey
  foreign key (owner_id) references auth.users(id) on delete cascade;

alter table public.board_members
  add constraint board_members_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
```

- [ ] **Step 4: Apply migration locally and run the test again**

Run: `supabase db reset` (re-applies all migrations against the local DB).
Then: `supabase test db`
Expected: all 8 assertions PASS.

- [ ] **Step 5: Regenerate types (optional but consistent with project memory rule)**

Run: `npm run types:db`
Verify: `git diff src/types/supabase.ts` shows the new FK relationships in the generated types (or no diff if generated types do not include FK metadata — both are acceptable).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/*_add_owner_fk_cascades.sql \
        supabase/tests/owner_fk_cascades_test.sql \
        src/types/supabase.ts
git commit -m "feat(db): add owner FK cascades to auth.users (#100)

Required by the delete-my-account flow: deleting an auth.users row
must cascade to kids, pictograms, boards, board_members. Backed by
pgTAP test asserting both constraint existence and ON DELETE CASCADE."
```

---

### Task 2: pgTAP behavioral test for FK cascade

**Files:**
- Modify: `supabase/tests/owner_fk_cascades_test.sql:7` (extend `plan(8)` → `plan(13)` and add assertions)

- [ ] **Step 1: Extend the test with behavioral assertions**

Replace the current `SELECT plan(8);` line with `SELECT plan(13);` and append after the existing assertions (before `SELECT * FROM finish();`):

```sql
-- Behavioral cascade test: insert auth + app rows, delete auth, assert empty.
-- Uses a sentinel uuid to avoid colliding with any existing test fixtures.
DO $$
DECLARE
  test_uid uuid := '00000000-0000-0000-0000-000000c45c4d';
BEGIN
  -- Disable triggers in this transaction so handle_new_user does not auto-seed
  -- a "Liam" kid + 17 template pictograms when we INSERT the sentinel auth
  -- user. raw_app_meta_data='{}' alone does NOT skip the trigger — the
  -- session_replication_role toggle is required.
  SET LOCAL session_replication_role = replica;

  INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data,
                          aud, role, created_at, updated_at)
  VALUES (test_uid, 'cascade-test@example.com', '{}'::jsonb, '{}'::jsonb,
          'authenticated', 'authenticated', now(), now());

  INSERT INTO public.kids (owner_id, name) VALUES (test_uid, 'cascade-kid');
  INSERT INTO public.pictograms (owner_id, label, style, glyph, tint)
    VALUES (test_uid, 'apple', 'illus', '🍎', 'red');

  -- Re-enable normal trigger behavior so the FK cascade fires on DELETE.
  SET LOCAL session_replication_role = origin;
END $$;

-- Pre-deletion counts: 1 auth row, 1 kid, 1 pictogram for the sentinel uid.
SELECT is(
  (SELECT count(*)::int FROM auth.users WHERE id = '00000000-0000-0000-0000-000000c45c4d'::uuid),
  1, 'pre-delete: 1 auth row for sentinel uid'
);
SELECT is(
  (SELECT count(*)::int FROM public.kids WHERE owner_id = '00000000-0000-0000-0000-000000c45c4d'::uuid),
  1, 'pre-delete: 1 kid for sentinel uid'
);
SELECT is(
  (SELECT count(*)::int FROM public.pictograms WHERE owner_id = '00000000-0000-0000-0000-000000c45c4d'::uuid),
  1, 'pre-delete: 1 pictogram for sentinel uid'
);

-- Trigger the cascade.
DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-000000c45c4d'::uuid;

-- Post-deletion counts: 0 of each.
SELECT is(
  (SELECT count(*)::int FROM public.kids WHERE owner_id = '00000000-0000-0000-0000-000000c45c4d'::uuid),
  0, 'post-delete: kids cascaded'
);
SELECT is(
  (SELECT count(*)::int FROM public.pictograms WHERE owner_id = '00000000-0000-0000-0000-000000c45c4d'::uuid),
  0, 'post-delete: pictograms cascaded'
);
```

- [ ] **Step 2: Run test to verify it passes**

Run: `supabase test db`
Expected: all 13 assertions PASS. The test is wrapped in `BEGIN; ... ROLLBACK;` so the sentinel rows do not persist.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/owner_fk_cascades_test.sql
git commit -m "test(db): add behavioral FK cascade test (#100)

Inserts a sentinel auth user with kids + pictograms, deletes the
auth row, asserts the dependent rows are gone. Catches a future
migration that accidentally weakens cascade semantics from CASCADE
to e.g. RESTRICT or SET NULL — constraint-existence alone wouldn't."
```

---

## Phase B — Edge function: scaffold + types

### Task 3: Scaffold the delete-account edge function directory

**Files:**
- Create: `supabase/functions/delete-account/deno.json`
- Create: `supabase/functions/delete-account/types.ts`

- [ ] **Step 1: Create deno.json**

Create `supabase/functions/delete-account/deno.json`:

```json
{
  "imports": {
    "@supabase/supabase-js": "jsr:@supabase/supabase-js@2",
    "std/assert": "jsr:@std/assert@1",
    "std/http": "jsr:@std/http@1"
  }
}
```

- [ ] **Step 2: Create the shared types file**

Create `supabase/functions/delete-account/types.ts`:

```ts
// Shared types for the delete-account edge function.
//
// Error codes are a closed set; the client switches on `error` to render
// the right toast (see src/lib/queries/account.ts). Keep this list in
// sync with that mapping — if you add a code here, add a toast there.

export type ErrorCode =
  | 'unauthorized'
  | 'method_not_allowed'
  | 'bad_request'
  | 'storage_purge_failed'
  | 'auth_delete_failed'
  | 'internal_error';

export interface SuccessResponse {
  ok: true;
}

export interface ErrorResponse {
  ok: false;
  error: ErrorCode;
  message: string;
}

export type DeleteResponse = SuccessResponse | ErrorResponse;

// Thrown by the pure deleteAccount() function for the handler to catch and
// translate into ErrorResponse. Carries the `step` for structured logging.
export class DeletionError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly step: 'storage_purge_audio' | 'storage_purge_images' | 'auth_delete' | 'unknown',
    message: string,
  ) {
    super(message);
    this.name = 'DeletionError';
  }
}

export const STORAGE_LIST_LIMIT = 1000;
export const STORAGE_RETRY_ATTEMPTS = 3;
export const AUDIO_BUCKET = 'pictogram-audio';
export const IMAGES_BUCKET = 'pictogram-images';
```

- [ ] **Step 3: Verify the types file is syntactically valid via Deno**

Run: `deno check supabase/functions/delete-account/types.ts`
Expected: clean exit (no output on success).

If `deno` is not on PATH, use the bundled one: `~/.cache/supabase/deno` or invoke via `supabase functions ...` only — the CI machine has Deno available; local devs may need to install Deno from https://deno.land/. Add a one-line note in the next runbook task if installation friction surfaces.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/delete-account/deno.json \
        supabase/functions/delete-account/types.ts
git commit -m "feat(functions): scaffold delete-account function (#100)

Empty entry-point; adds the closed-set error codes and DeletionError
class shared between the pure logic, the HTTP handler, and the client
mutation."
```

---

## Phase C — Edge function: pure deletion logic (TDD)

### Task 4: Write failing tests for `deleteAccount(client, userId)` happy paths

**Files:**
- Create: `supabase/functions/delete-account/fakeSupabaseClient.ts`
- Create: `supabase/functions/delete-account/deleteAccount.test.ts`

- [ ] **Step 1: Create the FakeSupabaseClient stub**

Create `supabase/functions/delete-account/fakeSupabaseClient.ts`:

```ts
// Hand-rolled stub matching the surface of @supabase/supabase-js that
// deleteAccount() consumes. Records every call in a flat log so tests can
// assert ordering (storage purges must happen before auth deletion).

import type { ErrorCode } from './types.ts';

export interface CallLogEntry {
  kind: 'storage.list' | 'storage.remove' | 'auth.admin.deleteUser';
  bucket?: string;
  prefix?: string;
  paths?: readonly string[];
  userId?: string;
}

interface BucketScript {
  // Each list call shifts one page off the front. Empty array returned
  // when exhausted.
  listResponses: Array<{ data?: Array<{ name: string }>; error?: { message: string } }>;
  // remove either succeeds (empty error) or fails with the given message,
  // optionally consumed once per call (so retries can hit different paths).
  removeResponses: Array<{ data?: Array<{ name: string }>; error?: { message: string } }>;
}

export interface FakeOptions {
  buckets: Record<string, BucketScript>;
  authDelete:
    | { ok: true }
    | { error: { message: string } };
}

export interface FakeClient {
  storage: {
    from: (bucket: string) => {
      list: (
        prefix: string,
        opts?: { limit?: number },
      ) => Promise<{ data: Array<{ name: string }> | null; error: { message: string } | null }>;
      remove: (
        paths: string[],
      ) => Promise<{ data: Array<{ name: string }> | null; error: { message: string } | null }>;
    };
  };
  auth: {
    admin: {
      deleteUser: (uid: string) => Promise<{ error: { message: string } | null }>;
    };
  };
}

export const createFakeClient = (
  options: FakeOptions,
): { client: FakeClient; calls: CallLogEntry[] } => {
  const calls: CallLogEntry[] = [];
  const remainingList: Record<string, BucketScript['listResponses']> = {};
  const remainingRemove: Record<string, BucketScript['removeResponses']> = {};
  for (const [bucket, script] of Object.entries(options.buckets)) {
    remainingList[bucket] = [...script.listResponses];
    remainingRemove[bucket] = [...script.removeResponses];
  }

  const client: FakeClient = {
    storage: {
      from: (bucket) => ({
        list: async (prefix) => {
          calls.push({ kind: 'storage.list', bucket, prefix });
          const next = remainingList[bucket]?.shift() ?? { data: [] };
          if (next.error) return { data: null, error: next.error };
          return { data: next.data ?? [], error: null };
        },
        remove: async (paths) => {
          calls.push({ kind: 'storage.remove', bucket, paths });
          const next = remainingRemove[bucket]?.shift() ?? { data: [] };
          if (next.error) return { data: null, error: next.error };
          return { data: next.data ?? [], error: null };
        },
      }),
    },
    auth: {
      admin: {
        deleteUser: async (userId) => {
          calls.push({ kind: 'auth.admin.deleteUser', userId });
          if ('ok' in options.authDelete && options.authDelete.ok) {
            return { error: null };
          }
          return { error: options.authDelete.error };
        },
      },
    },
  };
  return { client, calls };
};
```

- [ ] **Step 2: Write the failing happy-path tests**

Create `supabase/functions/delete-account/deleteAccount.test.ts`:

```ts
import { assertEquals, assertRejects } from 'std/assert';
import { createFakeClient } from './fakeSupabaseClient.ts';
import { deleteAccount } from './deleteAccount.ts';
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
  const audioRemove = calls.find((c) => c.kind === 'storage.remove' && c.bucket === 'pictogram-audio');
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

  await deleteAccount(client, UID);

  const audioCalls = calls.filter((c) => c.bucket === 'pictogram-audio');
  // 3 lists (page1, page2, empty) + 2 removes
  assertEquals(audioCalls.filter((c) => c.kind === 'storage.list').length, 3);
  assertEquals(audioCalls.filter((c) => c.kind === 'storage.remove').length, 2);
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
  const lastStorageIndex = calls.findLastIndex((c) =>
    c.kind === 'storage.list' || c.kind === 'storage.remove'
  );
  // auth.admin.deleteUser must come after the last storage call.
  if (authIndex <= lastStorageIndex) {
    throw new Error(`Ordering invariant violated: auth at ${authIndex}, last storage at ${lastStorageIndex}`);
  }
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `deno test --allow-env supabase/functions/delete-account/deleteAccount.test.ts`
Expected: all four tests FAIL with "Module not found" or similar — `deleteAccount.ts` does not exist yet.

- [ ] **Step 4: Implement minimal `deleteAccount.ts` to pass these tests**

Create `supabase/functions/delete-account/deleteAccount.ts`:

```ts
import {
  AUDIO_BUCKET,
  DeletionError,
  IMAGES_BUCKET,
  STORAGE_LIST_LIMIT,
  STORAGE_RETRY_ATTEMPTS,
} from './types.ts';

interface AdminClient {
  storage: {
    from: (bucket: string) => {
      list: (
        prefix: string,
        opts?: { limit?: number },
      ) => Promise<{ data: Array<{ name: string }> | null; error: { message: string } | null }>;
      remove: (
        paths: string[],
      ) => Promise<{ data: Array<{ name: string }> | null; error: { message: string } | null }>;
    };
  };
  auth: {
    admin: {
      deleteUser: (uid: string) => Promise<{ error: { message: string } | null }>;
    };
  };
}

const purgeBucket = async (
  client: AdminClient,
  bucket: string,
  userId: string,
  step: 'storage_purge_audio' | 'storage_purge_images',
): Promise<void> => {
  // Drain the prefix one page at a time until list returns empty.
  for (let safety = 0; safety < 1000; safety++) {
    const { data, error } = await client.storage
      .from(bucket)
      .list(userId, { limit: STORAGE_LIST_LIMIT });
    if (error) {
      throw new DeletionError('storage_purge_failed', step, `list ${bucket}: ${error.message}`);
    }
    if (!data || data.length === 0) return;

    const paths = data.map((o) => `${userId}/${o.name}`);
    let lastError: { message: string } | null = null;
    for (let attempt = 0; attempt < STORAGE_RETRY_ATTEMPTS; attempt++) {
      const removeResult = await client.storage.from(bucket).remove(paths);
      if (!removeResult.error) {
        lastError = null;
        break;
      }
      lastError = removeResult.error;
    }
    if (lastError) {
      throw new DeletionError(
        'storage_purge_failed',
        step,
        `remove ${bucket} after ${STORAGE_RETRY_ATTEMPTS} attempts: ${lastError.message}`,
      );
    }
  }
  throw new DeletionError(
    'storage_purge_failed',
    step,
    `safety limit reached draining ${bucket}; suspected pagination loop`,
  );
};

export const deleteAccount = async (client: AdminClient, userId: string): Promise<void> => {
  await purgeBucket(client, AUDIO_BUCKET, userId, 'storage_purge_audio');
  await purgeBucket(client, IMAGES_BUCKET, userId, 'storage_purge_images');

  const { error } = await client.auth.admin.deleteUser(userId);
  if (error) {
    if (error.message.toLowerCase().includes('not found')) return;
    throw new DeletionError('auth_delete_failed', 'auth_delete', error.message);
  }
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `deno test --allow-env supabase/functions/delete-account/deleteAccount.test.ts`
Expected: all 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/delete-account/fakeSupabaseClient.ts \
        supabase/functions/delete-account/deleteAccount.ts \
        supabase/functions/delete-account/deleteAccount.test.ts
git commit -m "feat(functions): pure deleteAccount() with TDD coverage (#100)

Storage-first ordering, paginated bucket drain, idempotent auth
deletion. FakeSupabaseClient stub records call order so the test
suite can assert the storage-before-auth invariant directly."
```

---

### Task 5: Write failing tests for `deleteAccount` failure paths

**Files:**
- Modify: `supabase/functions/delete-account/deleteAccount.test.ts` (append more tests)

- [ ] **Step 1: Append failure-path tests**

Add to `deleteAccount.test.ts`:

```ts
Deno.test('deleteAccount: storage.list errors → throws storage_purge_failed; auth NOT called', async () => {
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

  const err = await assertRejects(
    () => deleteAccount(client, UID),
    DeletionError,
  );
  assertEquals(err.code, 'storage_purge_failed');
  assertEquals(err.step, 'storage_purge_audio');
  assertEquals(calls.some((c) => c.kind === 'auth.admin.deleteUser'), false);
});

Deno.test('deleteAccount: storage.remove fails 3x persistent → throws after 3 retries', async () => {
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
  const removeCalls = calls.filter((c) => c.kind === 'storage.remove' && c.bucket === 'pictogram-audio');
  assertEquals(removeCalls.length, 3);
  assertEquals(calls.some((c) => c.kind === 'auth.admin.deleteUser'), false);
});

Deno.test('deleteAccount: auth.admin.deleteUser returns "user not found" → resolves OK (idempotent)', async () => {
  const { client } = createFakeClient({
    buckets: {
      'pictogram-audio': { listResponses: [{ data: [] }], removeResponses: [] },
      'pictogram-images': { listResponses: [{ data: [] }], removeResponses: [] },
    },
    authDelete: { error: { message: 'User not found' } },
  });

  // Should resolve, not throw.
  await deleteAccount(client, UID);
});

Deno.test('deleteAccount: auth.admin.deleteUser other error → throws auth_delete_failed', async () => {
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
});
```

- [ ] **Step 2: Run tests to verify they pass against the existing implementation**

Run: `deno test --allow-env supabase/functions/delete-account/deleteAccount.test.ts`
Expected: all 8 tests (4 from Task 4 + 4 new) PASS. The implementation in Task 4 already handles these paths correctly; adding the tests pins the behavior.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/delete-account/deleteAccount.test.ts
git commit -m "test(functions): cover deleteAccount failure paths (#100)

storage.list error / persistent remove failure / not-found-as-success /
other-error all covered. Pins storage-before-auth invariant under
failure conditions too."
```

---

## Phase D — Edge function: HTTP handler (TDD)

### Task 6: Write failing handler tests

**Files:**
- Create: `supabase/functions/delete-account/handler.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/delete-account/handler.test.ts`:

```ts
import { assertEquals } from 'std/assert';
import { handleRequest } from './index.ts';

// Stub admin client used by the handler for auth.getUser.
// Returns a configurable user (or error) per test.
type Authed = { id: string };

const makeAdminStub = (override: Partial<{
  getUser: (jwt: string | undefined) => Promise<{ data: { user: Authed | null }; error: unknown }>;
  deleteImpl: (uid: string) => Promise<void>;
}>) => ({
  auth: {
    getUser: override.getUser ?? (async () => ({ data: { user: { id: 'u-good' } }, error: null })),
  },
  // The handler calls deleteAccount() with this client; we stub it as a no-op
  // unless the test wants to simulate a deletion failure.
  __deleteImpl: override.deleteImpl ?? (async () => {}),
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test --allow-env supabase/functions/delete-account/handler.test.ts`
Expected: every test FAILS with "Module not found: ./index.ts" — the handler file does not exist yet.

- [ ] **Step 3: Commit (test-only commit; intentionally red)**

```bash
git add supabase/functions/delete-account/handler.test.ts
git commit -m "test(functions): failing tests for delete-account HTTP handler (#100)

Pins request/response contract: closed-set error codes, JWT-only
identity, idempotent {} body, method/method-not-allowed semantics.
Implementation lands in next commit."
```

---

### Task 7: Implement the HTTP handler to pass the tests

**Files:**
- Create: `supabase/functions/delete-account/index.ts`

- [ ] **Step 1: Implement the handler**

Create `supabase/functions/delete-account/index.ts`:

```ts
import { createClient } from '@supabase/supabase-js';
import { serve } from 'std/http';

import { deleteAccount } from './deleteAccount.ts';
import {
  type DeleteResponse,
  DeletionError,
  type ErrorCode,
} from './types.ts';

// Tests inject this shape; production builds it from env.
interface AdminLike {
  auth: {
    getUser: (jwt: string | undefined) => Promise<{
      data: { user: { id: string } | null };
      error: unknown;
    }>;
  };
  // Optional injection point for tests to swap the deletion implementation.
  __deleteImpl?: (uid: string) => Promise<void>;
}

const errorResponse = (code: ErrorCode, message: string, status: number): Response =>
  new Response(
    JSON.stringify({ ok: false, error: code, message } satisfies DeleteResponse),
    { status, headers: { 'content-type': 'application/json' } },
  );

const okResponse = (): Response =>
  new Response(
    JSON.stringify({ ok: true } satisfies DeleteResponse),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

const logFailure = (userId: string | null, step: string, error: unknown): void => {
  console.error(JSON.stringify({
    event: 'delete_account_failed',
    user_id: userId,
    step,
    error: error instanceof Error ? error.message : String(error),
  }));
};

const logSuccess = (userId: string, durationMs: number): void => {
  console.log(JSON.stringify({
    event: 'delete_account_success',
    user_id: userId,
    duration_ms: durationMs,
  }));
};

// Exported so handler.test.ts can drive it directly without a live server.
// In production, serve() wraps it (see bottom of file).
export const handleRequest = async (
  req: Request,
  admin: AdminLike & {
    storage?: unknown;
    auth?: unknown;
  } & Parameters<typeof deleteAccount>[0]['storage'] extends never ? AdminLike : AdminLike,
): Promise<Response> => {
  const start = Date.now();
  let userId: string | null = null;
  try {
    if (req.method !== 'POST') {
      return errorResponse('method_not_allowed', `method ${req.method} not allowed`, 405);
    }

    const raw = (await req.text()).trim();
    if (raw !== '' && raw !== '{}') {
      return errorResponse('bad_request', 'request body must be empty or {}', 400);
    }

    const auth = req.headers.get('Authorization') ?? '';
    const jwt = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : undefined;
    const { data } = await admin.auth.getUser(jwt);
    if (!data.user) {
      return errorResponse('unauthorized', 'missing or invalid JWT', 401);
    }
    userId = data.user.id;

    // Test injection: if __deleteImpl is provided, use it instead of the
    // real deleteAccount() — the unit tests can simulate failures cleanly.
    if (typeof admin.__deleteImpl === 'function') {
      await admin.__deleteImpl(userId);
    } else {
      // Production path: admin client matches the shape deleteAccount expects.
      await deleteAccount(admin as Parameters<typeof deleteAccount>[0], userId);
    }

    logSuccess(userId, Date.now() - start);
    return okResponse();
  } catch (err) {
    if (err instanceof DeletionError) {
      logFailure(userId, err.step, err);
      return errorResponse(err.code, err.message, 500);
    }
    logFailure(userId, 'unknown', err);
    return errorResponse('internal_error', 'unexpected error', 500);
  }
};

// Production entry point: build the admin client from env and start serving.
// std/http's serve() handles the Deno deployment runtime.
if (import.meta.main) {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  serve((req) => handleRequest(req, admin as unknown as AdminLike));
}
```

NOTE: the `Parameters<typeof deleteAccount>[0]['storage']` conditional in the type is intentional but ugly. If the engineer prefers, simplify to `AdminLike & { storage?: unknown }` and trust the runtime contract — the unit tests do not exercise the storage path through the handler. The production path is covered by the integration test in Phase E.

- [ ] **Step 2: Type-check the function**

Run: `deno check supabase/functions/delete-account/index.ts`
Expected: clean exit. If type errors, simplify the `handleRequest` signature per the NOTE above to:

```ts
export const handleRequest = async (
  req: Request,
  admin: AdminLike,
): Promise<Response> => { /* ... */ };
```

…and cast `admin` to the deleteAccount input type at the call site:
```ts
await deleteAccount(admin as unknown as Parameters<typeof deleteAccount>[0], userId);
```

- [ ] **Step 3: Run all function tests**

Run: `deno test --allow-env supabase/functions/delete-account/`
Expected: all 8 deleteAccount tests + all 8 handler tests PASS (16 total).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/delete-account/index.ts
git commit -m "feat(functions): HTTP handler for delete-account (#100)

Verifies JWT, validates body+method, delegates to deleteAccount(),
maps DeletionError to closed-set error codes. Structured-log shape
ready for Sentry integration (#45)."
```

---

## Phase E — End-to-end integration test

### Task 8: Integration test script — scaffolding

**Files:**
- Create: `supabase/tests/delete_account_integration_test.sh`

- [ ] **Step 1: Confirm local Supabase prerequisites**

Run: `supabase status`
Expected: shows DB URL, API URL, JWT secrets. If "supabase start" hasn't run, run it now.

Also verify storage RLS allows service-role to remove objects under arbitrary prefixes:
```sh
supabase status -o json | jq -r '.SERVICE_ROLE_KEY'   # capture for the script
```

- [ ] **Step 2: Write the integration test script**

Create `supabase/tests/delete_account_integration_test.sh`:

```sh
#!/usr/bin/env bash
#
# End-to-end test for the delete-account edge function.
#
# Sets up a real user with kids/boards/pictograms/storage objects, invokes
# the function, then asserts everything is gone. Catches FK-cascade gaps,
# storage RLS blocks, and auth.admin.deleteUser surprises that pure-unit
# tests cannot.
#
# Prerequisites:
#   - `supabase start` is running
#   - `supabase functions serve delete-account` is running in another tab
#     (or this script will spawn it; see SERVE_LOCAL=1 below)
#   - jq, curl available on PATH

set -euo pipefail

API_URL="$(supabase status -o json | jq -r '.API_URL')"
ANON_KEY="$(supabase status -o json | jq -r '.ANON_KEY')"
SERVICE_KEY="$(supabase status -o json | jq -r '.SERVICE_ROLE_KEY')"
DB_URL="$(supabase status -o json | jq -r '.DB_URL')"
FUNC_URL="${API_URL}/functions/v1/delete-account"

EMAIL="del-test-$(date +%s)@example.com"
PASSWORD="correct-horse-battery-staple-$(date +%s)"

echo "==> 1/8 sign up fresh user"
SIGNUP=$(curl -fsS -X POST "${API_URL}/auth/v1/signup" \
  -H "apikey: ${ANON_KEY}" -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")
USER_JWT=$(echo "$SIGNUP" | jq -r '.access_token')
USER_ID=$(echo "$SIGNUP" | jq -r '.user.id')
echo "    user_id: $USER_ID"

echo "==> 2/8 insert app rows via user JWT"
curl -fsS -X POST "${API_URL}/rest/v1/kids" \
  -H "apikey: ${ANON_KEY}" -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d "{\"owner_id\":\"${USER_ID}\",\"name\":\"e2e-kid\"}" > /dev/null

curl -fsS -X POST "${API_URL}/rest/v1/pictograms" \
  -H "apikey: ${ANON_KEY}" -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d "{\"owner_id\":\"${USER_ID}\",\"label\":\"apple\",\"style\":\"illus\",\"glyph\":\"🍎\",\"tint\":\"red\"}" > /dev/null

echo "==> 3/8 upload storage objects"
echo "fake-audio" > /tmp/del-audio.mp3
echo "fake-image" > /tmp/del-image.png
curl -fsS -X POST "${API_URL}/storage/v1/object/pictogram-audio/${USER_ID}/test.mp3" \
  -H "apikey: ${ANON_KEY}" -H "Authorization: Bearer ${USER_JWT}" \
  --data-binary "@/tmp/del-audio.mp3" > /dev/null
curl -fsS -X POST "${API_URL}/storage/v1/object/pictogram-images/${USER_ID}/test.png" \
  -H "apikey: ${ANON_KEY}" -H "Authorization: Bearer ${USER_JWT}" \
  --data-binary "@/tmp/del-image.png" > /dev/null

echo "==> 4/8 pre-deletion sanity (counts via service-role)"
PRE_KIDS=$(psql "$DB_URL" -tAc "SELECT count(*) FROM public.kids WHERE owner_id='$USER_ID'")
PRE_PICTS=$(psql "$DB_URL" -tAc "SELECT count(*) FROM public.pictograms WHERE owner_id='$USER_ID'")
[[ "$PRE_KIDS" == "1" ]]  || { echo "FAIL pre-kids=$PRE_KIDS"; exit 1; }
[[ "$PRE_PICTS" == "1" ]] || { echo "FAIL pre-picts=$PRE_PICTS"; exit 1; }

echo "==> 5/8 invoke delete-account function"
RESPONSE=$(curl -fsS -X POST "$FUNC_URL" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" \
  -d '{}')
echo "    response: $RESPONSE"
[[ "$(echo "$RESPONSE" | jq -r '.ok')" == "true" ]] || { echo "FAIL response not ok"; exit 1; }

echo "==> 6/8 post-deletion: app rows gone (cascade)"
POST_AUTH=$(psql "$DB_URL" -tAc "SELECT count(*) FROM auth.users WHERE id='$USER_ID'")
POST_KIDS=$(psql "$DB_URL" -tAc "SELECT count(*) FROM public.kids WHERE owner_id='$USER_ID'")
POST_PICTS=$(psql "$DB_URL" -tAc "SELECT count(*) FROM public.pictograms WHERE owner_id='$USER_ID'")
[[ "$POST_AUTH"  == "0" ]] || { echo "FAIL post-auth=$POST_AUTH";   exit 1; }
[[ "$POST_KIDS"  == "0" ]] || { echo "FAIL post-kids=$POST_KIDS";   exit 1; }
[[ "$POST_PICTS" == "0" ]] || { echo "FAIL post-picts=$POST_PICTS"; exit 1; }

echo "==> 7/8 post-deletion: storage objects gone"
POST_AUDIO=$(psql "$DB_URL" -tAc "SELECT count(*) FROM storage.objects WHERE bucket_id='pictogram-audio' AND (storage.foldername(name))[1]='$USER_ID'")
POST_IMG=$(psql "$DB_URL" -tAc "SELECT count(*) FROM storage.objects WHERE bucket_id='pictogram-images' AND (storage.foldername(name))[1]='$USER_ID'")
[[ "$POST_AUDIO" == "0" ]] || { echo "FAIL post-audio=$POST_AUDIO"; exit 1; }
[[ "$POST_IMG"   == "0" ]] || { echo "FAIL post-img=$POST_IMG";     exit 1; }

echo "==> 8/8 sign-in attempt now fails"
SIGNIN_STATUS=$(curl -fsS -o /dev/null -w '%{http_code}' -X POST "${API_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${ANON_KEY}" -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}" || echo "EXPECTED_FAIL")
# Supabase Auth returns 400 with invalid_grant when credentials don't match.
[[ "$SIGNIN_STATUS" == "400" ]] || { echo "FAIL signin status=$SIGNIN_STATUS (expected 400)"; exit 1; }

rm -f /tmp/del-audio.mp3 /tmp/del-image.png
echo "==> ALL CHECKS PASSED"
```

- [ ] **Step 3: Make the script executable**

Run: `chmod +x supabase/tests/delete_account_integration_test.sh`

- [ ] **Step 4: Run the script (manually, with function served)**

Open a second terminal and run: `supabase functions serve delete-account --env-file supabase/functions/.env.local`

You will need a `supabase/functions/.env.local` file (do NOT commit it — gitignored) with:
```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<value-from-`supabase status`>
```

In the original terminal: `bash supabase/tests/delete_account_integration_test.sh`
Expected: `==> ALL CHECKS PASSED`. If any FAIL, debug before continuing — this is the test that proves the system works end-to-end.

- [ ] **Step 5: Commit**

```bash
git add supabase/tests/delete_account_integration_test.sh
git commit -m "test(integration): E2E delete-account flow (#100)

Signs up a real user, populates app rows + storage, invokes the
edge function, asserts everything is gone (cascade + storage purge
+ sign-in denial). Run via: bash supabase/tests/delete_account_integration_test.sh"
```

---

### Task 9: Wire integration test to npm + CI

**Files:**
- Modify: `package.json` (add script)
- Modify: `.github/workflows/ci.yml` (add steps)

- [ ] **Step 1: Add npm scripts**

Modify `package.json` — find the `"scripts"` block and add two entries:

```json
{
  "scripts": {
    "...existing keys...": "...",
    "test:functions": "deno test --allow-env supabase/functions/",
    "test:e2e:delete-account": "bash supabase/tests/delete_account_integration_test.sh"
  }
}
```

- [ ] **Step 2: Run the new scripts to verify wiring**

Run: `npm run test:functions`
Expected: 16 Deno tests pass.

(Skip `npm run test:e2e:delete-account` for now if the local function isn't being served — Step 4 of Task 8 already exercised it.)

- [ ] **Step 3: Extend CI workflow**

Modify `.github/workflows/ci.yml`. Replace its body with:

```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run test
      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x
      - run: npm run test:functions
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: supabase start
      - run: npm run test:db
      - name: Serve function in background
        run: |
          mkdir -p supabase/functions
          cat > supabase/functions/.env.local <<EOF
          SUPABASE_URL=$(supabase status -o json | jq -r '.API_URL')
          SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o json | jq -r '.SERVICE_ROLE_KEY')
          EOF
          nohup supabase functions serve delete-account --env-file supabase/functions/.env.local &>/tmp/funcs.log &
          # Wait for the function to start serving.
          for i in {1..30}; do
            if curl -fsS -o /dev/null "$(supabase status -o json | jq -r '.API_URL')/functions/v1/delete-account" -X OPTIONS; then
              echo "function ready"; break
            fi
            sleep 1
          done
      - run: npm run test:e2e:delete-account
      - run: supabase stop
```

- [ ] **Step 4: Commit**

```bash
git add package.json .github/workflows/ci.yml
git commit -m "ci: run Deno + integration tests for delete-account (#100)

Adds two npm scripts (test:functions, test:e2e:delete-account)
and wires CI to run them alongside existing typecheck/lint/test.
Local supabase + served function is started for the E2E step."
```

---

## Phase F — Client mutation (TDD)

### Task 10: Write failing tests for `mapErrorCode` + `useDeleteMyAccount`

**Files:**
- Create: `src/lib/queries/account.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/queries/account.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn<(name: string, opts: { body: unknown }) => Promise<{
  data: { ok: boolean; error?: string; message?: string } | null;
  error: { message: string } | null;
}>>();
const signOutMock = vi.fn<() => Promise<{ error: null }>>(async () => ({ error: null }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (name: string, opts: { body: unknown }) => invokeMock(name, opts) },
    auth: { signOut: () => signOutMock() },
  },
}));

const { mapErrorCode, DeleteAccountError, useDeleteMyAccount } = await import('./account');

const makeWrapper = (qc: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

beforeEach(() => {
  invokeMock.mockReset();
  signOutMock.mockClear();
});

describe('mapErrorCode', () => {
  it('returns a DeleteAccountError with the closed-set code', () => {
    const err = mapErrorCode({ ok: false, error: 'storage_purge_failed', message: 'm' });
    expect(err).toBeInstanceOf(DeleteAccountError);
    expect(err.code).toBe('storage_purge_failed');
    expect(err.message).toBe('m');
  });

  it('falls back to internal_error for unknown codes', () => {
    const err = mapErrorCode({ ok: false, error: 'who_knows', message: 'x' } as never);
    expect(err.code).toBe('internal_error');
  });
});

describe('useDeleteMyAccount', () => {
  it('invokes the edge function with body {}', async () => {
    invokeMock.mockResolvedValueOnce({ data: { ok: true }, error: null });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useDeleteMyAccount(), { wrapper: makeWrapper(qc) });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invokeMock).toHaveBeenCalledWith('delete-account', { body: {} });
  });

  it('on success: clears query cache then signs out (in that order)', async () => {
    invokeMock.mockResolvedValueOnce({ data: { ok: true }, error: null });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(['boards'], [{ id: 'b1' }]);
    const order: string[] = [];
    const origClear = qc.clear.bind(qc);
    qc.clear = () => { order.push('clear'); origClear(); };
    signOutMock.mockImplementationOnce(async () => { order.push('signOut'); return { error: null }; });

    const { result } = renderHook(() => useDeleteMyAccount(qc), { wrapper: makeWrapper(qc) });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(order).toEqual(['clear', 'signOut']);
    expect(qc.getQueryData(['boards'])).toBeUndefined();
  });

  it('on error: does NOT clear cache or sign out', async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: false, error: 'auth_delete_failed', message: 'boom' },
      error: null,
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(['boards'], [{ id: 'b1' }]);

    const { result } = renderHook(() => useDeleteMyAccount(qc), { wrapper: makeWrapper(qc) });
    result.current.mutate();
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(qc.getQueryData(['boards'])).toEqual([{ id: 'b1' }]);
    expect(signOutMock).not.toHaveBeenCalled();
    expect((result.current.error as InstanceType<typeof DeleteAccountError>).code).toBe('auth_delete_failed');
  });

  it('translates the closed-set error codes via mapErrorCode', async () => {
    const codes = ['unauthorized', 'storage_purge_failed', 'auth_delete_failed', 'internal_error'] as const;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    for (const code of codes) {
      invokeMock.mockReset();
      invokeMock.mockResolvedValueOnce({
        data: { ok: false, error: code, message: 'm' },
        error: null,
      });
      const { result, unmount } = renderHook(() => useDeleteMyAccount(qc), { wrapper: makeWrapper(qc) });
      result.current.mutate();
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect((result.current.error as InstanceType<typeof DeleteAccountError>).code).toBe(code);
      unmount();
    }
  });
});
```

NOTE: the `useDeleteMyAccount(qc)` accepts an optional `QueryClient` for testability. Production callers don't pass it; the hook falls back to `useQueryClient()`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/lib/queries/account.test.tsx`
Expected: tests FAIL with "Cannot find module './account'" — file does not exist yet.

- [ ] **Step 3: Commit (test-only, intentionally red)**

```bash
git add src/lib/queries/account.test.tsx
git commit -m "test(client): failing tests for useDeleteMyAccount (#100)

Pins: empty-body invocation, success ordering (clear-then-signOut),
error handling (no side-effects on failure), closed-set error code
translation. Implementation in next commit."
```

---

### Task 11: Implement `account.ts` to pass the tests

**Files:**
- Create: `src/lib/queries/account.ts`

- [ ] **Step 1: Implement the module**

Create `src/lib/queries/account.ts`:

```ts
import { type QueryClient, useMutation, type UseMutationResult, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

// Closed-set error codes shared with the edge function. If the function
// adds a new code, add it here and update DeleteAccountDialog's toast map.
export type DeleteAccountErrorCode =
  | 'unauthorized'
  | 'method_not_allowed'
  | 'bad_request'
  | 'storage_purge_failed'
  | 'auth_delete_failed'
  | 'internal_error';

const KNOWN_CODES: ReadonlySet<DeleteAccountErrorCode> = new Set([
  'unauthorized',
  'method_not_allowed',
  'bad_request',
  'storage_purge_failed',
  'auth_delete_failed',
  'internal_error',
]);

export class DeleteAccountError extends Error {
  constructor(public readonly code: DeleteAccountErrorCode, message: string) {
    super(message);
    this.name = 'DeleteAccountError';
  }
}

interface RawErrorPayload {
  ok: false;
  error: string;
  message?: string;
}

export const mapErrorCode = (payload: RawErrorPayload): DeleteAccountError => {
  const code: DeleteAccountErrorCode =
    KNOWN_CODES.has(payload.error as DeleteAccountErrorCode)
      ? (payload.error as DeleteAccountErrorCode)
      : 'internal_error';
  return new DeleteAccountError(code, payload.message ?? '');
};

export const useDeleteMyAccount = (
  // Optional injection for testing; production code calls without args.
  injectedClient?: QueryClient,
): UseMutationResult<void, DeleteAccountError, void> => {
  const ctxClient = useQueryClient();
  const qc = injectedClient ?? ctxClient;
  return useMutation<void, DeleteAccountError, void>({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke<{
        ok: boolean;
        error?: string;
        message?: string;
      }>('delete-account', { body: {} });
      if (error) {
        throw new DeleteAccountError('internal_error', error.message);
      }
      if (!data?.ok) {
        throw mapErrorCode({
          ok: false,
          error: data?.error ?? 'internal_error',
          message: data?.message,
        });
      }
    },
    onSuccess: async () => {
      qc.clear();
      await supabase.auth.signOut();
    },
  });
};
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm run test -- src/lib/queries/account.test.tsx`
Expected: all 5 tests PASS.

- [ ] **Step 3: Run typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean exit.

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries/account.ts
git commit -m "feat(client): useDeleteMyAccount mutation (#100)

Closed-set error code mapping; cache clear before sign-out so no
stale query refires; no retry — user just clicked 'delete forever'."
```

---

## Phase G — UI: routes + dialog

### Task 12: Verify AuthGate behavior, then add `/account-deleted` and `/privacy-policy` routes

**Files:**
- Read first: `src/app/AuthGate.tsx`
- Create: `src/features/account-deleted/AccountDeletedRoute.tsx`
- Create: `src/features/privacy-policy/PrivacyPolicyRoute.tsx`
- Modify: `src/app/routes.tsx`

- [ ] **Step 1: Read AuthGate to learn its semantics**

Run: `cat src/app/AuthGate.tsx`
Inspect: does it block ALL routes when unauthenticated, or does it have a passthrough list (e.g., for `/login`)?

- [ ] **Step 2: Decide based on what AuthGate does**

Two cases:
- **AuthGate has a passthrough list**: add `/account-deleted` and `/privacy-policy` to that list.
- **AuthGate blocks unconditionally and redirects unauth → /login**: extend AuthGate with a passthrough list in this task (it's load-bearing for the deletion flow). Document the change in the commit.

If the engineer is unsure, choose the conservative path: add a `PUBLIC_ROUTES = ['/login', '/account-deleted', '/privacy-policy']` constant to AuthGate and skip the redirect when the current pathname matches.

- [ ] **Step 3: Create AccountDeletedRoute**

Create `src/features/account-deleted/AccountDeletedRoute.tsx`:

```tsx
import type { JSX } from 'react';
import { Link } from 'react-router-dom';

export const AccountDeletedRoute = (): JSX.Element => (
  <main role="main" className="tal" data-testid="account-deleted-route">
    <h1>Your account has been deleted</h1>
    <p>
      All your data — kids, boards, pictograms, and recordings — has been removed.
      This cannot be undone.
    </p>
    <p>
      <Link to="/login">Sign up again</Link>
    </p>
  </main>
);
```

- [ ] **Step 4: Install react-markdown for the privacy policy route**

Run: `npm install react-markdown`
Expected: clean install; `package.json` and `package-lock.json` updated.

- [ ] **Step 5: Create PrivacyPolicyRoute (markdown comes in Task 17)**

Create `src/features/privacy-policy/PrivacyPolicyRoute.tsx`:

```tsx
import type { JSX } from 'react';
import ReactMarkdown from 'react-markdown';

// Vite's ?raw query loads the file's text as a string at build time, making
// docs/privacy-policy.md the single source of truth. If the docs file is
// updated, the rendered route picks up the change on next build/dev reload.
import policyMarkdown from '../../../docs/privacy-policy.md?raw';

export const PrivacyPolicyRoute = (): JSX.Element => (
  <main role="main" className="tal" data-testid="privacy-policy-route">
    <ReactMarkdown>{policyMarkdown}</ReactMarkdown>
  </main>
);
```

NOTE 1: this import will fail to resolve until Task 17 creates `docs/privacy-policy.md`. That's fine — wire the route now, write the content later. To unblock the typecheck immediately, create a minimal placeholder file: `printf "# Privacy Policy\n\nPlaceholder — see Task 17.\n" > docs/privacy-policy.md`. Task 17 overwrites this.

NOTE 2: Vite's `?raw` import requires the `vite/client` ambient types. Most Vite projects have a `src/vite-env.d.ts` with `/// <reference types="vite/client" />`. If TypeScript complains about the `?raw` import (e.g., "Cannot find module '...?raw'"), check whether `src/vite-env.d.ts` exists and contains that reference; if not, create it with a single line:

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 6: Wire the routes**

Modify `src/app/routes.tsx`. Add lazy imports near the existing ones:

```tsx
const AccountDeletedRoute = lazy(() =>
  import('@/features/account-deleted/AccountDeletedRoute').then((m) => ({
    default: m.AccountDeletedRoute,
  })),
);
const PrivacyPolicyRoute = lazy(() =>
  import('@/features/privacy-policy/PrivacyPolicyRoute').then((m) => ({
    default: m.PrivacyPolicyRoute,
  })),
);
```

In the `createBrowserRouter` route array, add two entries (place before the catch-all `*` route):

```tsx
{ path: '/account-deleted', element: wrap(<AccountDeletedRoute />, 'parent') },
{ path: '/privacy-policy',  element: wrap(<PrivacyPolicyRoute />, 'parent') },
```

- [ ] **Step 7: Add a routing test**

Modify `src/app/routes.test.tsx`. Add:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';

// Inside an existing describe('routes', ...) block (or a new one):
it('/account-deleted is reachable without authentication', async () => {
  const router = createMemoryRouter(
    [
      { path: '/account-deleted', element: wrap(<AccountDeletedRoute />, 'parent') },
      { path: '/login', element: <div data-testid="login" /> },
    ],
    { initialEntries: ['/account-deleted'] },
  );
  render(<RouterProvider router={router} />);
  await waitFor(() => {
    expect(screen.getByTestId('account-deleted-route')).toBeInTheDocument();
  });
  expect(screen.getByRole('link', { name: /sign up again/i }).getAttribute('href')).toBe('/login');
});

it('/privacy-policy renders the markdown content', async () => {
  const router = createMemoryRouter(
    [{ path: '/privacy-policy', element: wrap(<PrivacyPolicyRoute />, 'parent') }],
    { initialEntries: ['/privacy-policy'] },
  );
  render(<RouterProvider router={router} />);
  await waitFor(() => {
    expect(screen.getByTestId('privacy-policy-route')).toBeInTheDocument();
  });
  // The first H1 in docs/privacy-policy.md is "Privacy Policy".
  expect(screen.getByRole('heading', { level: 1, name: /privacy policy/i })).toBeInTheDocument();
});
```

You will need to import `AccountDeletedRoute`, `PrivacyPolicyRoute`, and the `wrap` helper from `routes.tsx` — `wrap` is currently file-local; either export it from `routes.tsx` (cleanest) or duplicate a minimal version in the test. Take whichever path is least invasive.

If the existing `routes.test.tsx` does not use `RouterProvider`/`createMemoryRouter` (older test pattern), match the existing pattern instead — the assertion content (testid + link href) is the load-bearing part, not the rendering harness.

- [ ] **Step 8: Run typecheck + tests**

Run: `npm run typecheck && npm run test`
Expected: clean exit.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/app/routes.tsx \
        src/features/account-deleted/AccountDeletedRoute.tsx \
        src/features/privacy-policy/PrivacyPolicyRoute.tsx \
        docs/privacy-policy.md \
        src/app/AuthGate.tsx src/app/AuthGate.test.tsx \
        src/app/routes.test.tsx
git commit -m "feat(routes): /account-deleted and /privacy-policy public routes (#100)

AuthGate gains a passthrough list so the deletion-success page and
the public-facing privacy policy are reachable without a session.
Privacy-policy text is loaded via Vite ?raw import — single source
of truth lives in docs/privacy-policy.md."
```

(Adjust the file list to match what was actually changed; AuthGate may not need editing if it already supports public routes.)

---

### Task 13: Write failing tests for `DeleteAccountDialog`

**Files:**
- Create: `src/features/settings/DeleteAccountDialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/features/settings/DeleteAccountDialog.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mutateMock = vi.fn();
const mutationState = { isPending: false, isError: false, error: null as Error | null };

vi.mock('@/lib/queries/account', () => ({
  useDeleteMyAccount: () => ({
    mutate: mutateMock,
    isPending: mutationState.isPending,
    isError: mutationState.isError,
    error: mutationState.error,
  }),
  DeleteAccountError: class extends Error {
    constructor(public code: string, message: string) {
      super(message);
    }
  },
}));

const { DeleteAccountDialog } = await import('./DeleteAccountDialog');

const makeWrapper = (children: ReactNode): JSX.Element => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

beforeEach(() => {
  mutateMock.mockReset();
  mutationState.isPending = false;
  mutationState.isError = false;
  mutationState.error = null;
});

describe('DeleteAccountDialog', () => {
  const renderDialog = (onSuccess = vi.fn(), onCancel = vi.fn()): { onSuccess: typeof onSuccess; onCancel: typeof onCancel } => {
    render(makeWrapper(<DeleteAccountDialog onSuccess={onSuccess} onCancel={onCancel} />));
    return { onSuccess, onCancel };
  };

  it('initially: destructive button disabled, cancel enabled', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: /delete forever/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeEnabled();
  });

  it('typing wrong phrase keeps button disabled', async () => {
    renderDialog();
    const input = screen.getByLabelText(/type/i);
    await userEvent.type(input, 'delete me');
    expect(screen.getByRole('button', { name: /delete forever/i })).toBeDisabled();
  });

  it('typing "delete my account" enables the button', async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText(/type/i), 'delete my account');
    expect(screen.getByRole('button', { name: /delete forever/i })).toBeEnabled();
  });

  it('case-insensitive: "DELETE MY ACCOUNT" enables', async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText(/type/i), 'DELETE MY ACCOUNT');
    expect(screen.getByRole('button', { name: /delete forever/i })).toBeEnabled();
  });

  it('whitespace tolerated: "  delete my account  " enables', async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText(/type/i), '  delete my account  ');
    expect(screen.getByRole('button', { name: /delete forever/i })).toBeEnabled();
  });

  it('clicking destructive fires the mutation', async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText(/type/i), 'delete my account');
    await userEvent.click(screen.getByRole('button', { name: /delete forever/i }));
    expect(mutateMock).toHaveBeenCalledTimes(1);
  });

  it('while pending: both buttons disabled, spinner visible', () => {
    mutationState.isPending = true;
    renderDialog();
    expect(screen.getByRole('button', { name: /delete forever/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('Cancel button → onCancel prop fires; mutation NOT called', async () => {
    const { onCancel } = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('default focus is the Cancel button', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: /cancel/i })).toHaveFocus();
  });

  it('shows toast on storage_purge_failed error', () => {
    mutationState.isError = true;
    mutationState.error = Object.assign(new Error('m'), { code: 'storage_purge_failed' });
    renderDialog();
    expect(screen.getByRole('alert')).toHaveTextContent(/media files/i);
  });

  it('shows toast on auth_delete_failed error', () => {
    mutationState.isError = true;
    mutationState.error = Object.assign(new Error('m'), { code: 'auth_delete_failed' });
    renderDialog();
    expect(screen.getByRole('alert')).toHaveTextContent(/complete the deletion/i);
  });

  it('falls back to generic toast on unknown error', () => {
    mutationState.isError = true;
    mutationState.error = Object.assign(new Error('m'), { code: 'internal_error' });
    renderDialog();
    expect(screen.getByRole('alert')).toHaveTextContent(/something went wrong/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/features/settings/DeleteAccountDialog.test.tsx`
Expected: tests FAIL with "Cannot find module './DeleteAccountDialog'".

- [ ] **Step 3: Commit (test-only, intentionally red)**

```bash
git add src/features/settings/DeleteAccountDialog.test.tsx
git commit -m "test(ui): failing tests for DeleteAccountDialog (#100)

Pins phrase comparison (case-insensitive, trimmed), button states,
default focus on Cancel, and per-error-code toast wording."
```

---

### Task 14: Implement `DeleteAccountDialog`

**Files:**
- Create: `src/features/settings/DeleteAccountDialog.tsx`
- Create: `src/features/settings/DeleteAccountDialog.module.css`

- [ ] **Step 1: Implement the dialog**

Create `src/features/settings/DeleteAccountDialog.tsx`:

```tsx
import { type JSX, useEffect, useId, useRef, useState } from 'react';

import { type DeleteAccountError, useDeleteMyAccount } from '@/lib/queries/account';

import styles from './DeleteAccountDialog.module.css';

const REQUIRED_PHRASE = 'delete my account';

interface Props {
  onSuccess: () => void;
  onCancel: () => void;
}

const toastFor = (err: DeleteAccountError | null): string => {
  if (!err) return '';
  switch (err.code) {
    case 'unauthorized':
      return 'Your session expired. Please sign in again.';
    case 'storage_purge_failed':
      return "We couldn't delete your media files. Try again, or contact support if it keeps failing.";
    case 'auth_delete_failed':
      return "We couldn't complete the deletion. Try again, or contact support if it keeps failing.";
    default:
      return 'Something went wrong. Please contact support.';
  }
};

export const DeleteAccountDialog = ({ onSuccess, onCancel }: Props): JSX.Element => {
  const inputId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [phrase, setPhrase] = useState('');
  const mutation = useDeleteMyAccount();

  const matches = phrase.trim().toLowerCase() === REQUIRED_PHRASE;
  const disabled = mutation.isPending;

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    if (mutation.isSuccess) onSuccess();
  }, [mutation.isSuccess, onSuccess]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !mutation.isPending) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel, mutation.isPending]);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="del-acct-title" className={styles.dialog}>
      <h2 id="del-acct-title">Delete your account?</h2>
      <p>This permanently deletes:</p>
      <ul>
        <li>Your account</li>
        <li>All kids you&apos;ve added</li>
        <li>All boards</li>
        <li>All pictograms (including images and recordings)</li>
        <li>All sharing relationships</li>
      </ul>
      <p>
        <strong>This cannot be undone.</strong>
      </p>
      <label htmlFor={inputId}>Type <em>delete my account</em> to confirm.</label>
      <input
        id={inputId}
        type="text"
        value={phrase}
        onChange={(e) => setPhrase(e.target.value)}
        disabled={disabled}
        autoComplete="off"
      />
      {mutation.isError && (
        <div role="alert" className={styles.toast}>
          {toastFor(mutation.error as DeleteAccountError)}
        </div>
      )}
      <div className={styles.actions}>
        <button type="button" ref={cancelRef} onClick={onCancel} disabled={disabled}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={disabled || !matches}
          className={styles.destructive}
        >
          {mutation.isPending ? <span role="progressbar" aria-label="Deleting" /> : 'Delete forever'}
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Add minimal styles**

Create `src/features/settings/DeleteAccountDialog.module.css`:

```css
.dialog {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  color: white;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  z-index: 1000;
}

.actions {
  display: flex;
  gap: 1rem;
  margin-top: auto;
}

.destructive {
  background: var(--color-destructive, crimson);
  color: white;
}

.destructive:disabled {
  opacity: 0.5;
}

.toast {
  background: rgba(255, 80, 80, 0.2);
  border: 1px solid var(--color-destructive, crimson);
  padding: 0.75rem;
  border-radius: 0.25rem;
}
```

(The exact styles don't matter for correctness; match repo conventions if known.)

- [ ] **Step 3: Run tests**

Run: `npm run test -- src/features/settings/DeleteAccountDialog.test.tsx`
Expected: all 11 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/settings/DeleteAccountDialog.tsx \
        src/features/settings/DeleteAccountDialog.module.css
git commit -m "feat(ui): DeleteAccountDialog typed-phrase confirmation (#100)

Full-screen modal, default focus on Cancel, Esc cancels (only when
not mid-mutation), case-insensitive phrase comparison, per-code
toast wording."
```

---

### Task 15: `DeleteAccountSection` + `SettingsRoute` integration

**Files:**
- Create: `src/features/settings/DeleteAccountSection.tsx`
- Create: `src/features/settings/DeleteAccountSection.test.tsx`
- Modify: `src/features/settings/SettingsRoute.tsx`
- Modify: `src/features/settings/SettingsRoute.test.tsx`

- [ ] **Step 1: Write failing test for `DeleteAccountSection`**

Create `src/features/settings/DeleteAccountSection.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/queries/account', () => ({
  useDeleteMyAccount: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null, isSuccess: false }),
  DeleteAccountError: class extends Error {},
}));

const { DeleteAccountSection } = await import('./DeleteAccountSection');

describe('DeleteAccountSection', () => {
  const renderIt = (): void => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter
          initialEntries={['/settings']}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Routes>
            <Route path="/settings" element={<DeleteAccountSection />} />
            <Route path="/account-deleted" element={<div data-testid="deleted" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  it('renders the destructive link', () => {
    renderIt();
    expect(screen.getByRole('button', { name: /delete my account/i })).toBeInTheDocument();
  });

  it('clicking opens the dialog', async () => {
    renderIt();
    await userEvent.click(screen.getByRole('button', { name: /delete my account/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('links to the privacy policy', () => {
    renderIt();
    const link = screen.getByRole('link', { name: /privacy policy/i });
    expect(link.getAttribute('href')).toBe('/privacy-policy');
  });
});
```

- [ ] **Step 2: Implement `DeleteAccountSection`**

Create `src/features/settings/DeleteAccountSection.tsx`:

```tsx
import { type JSX, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { DeleteAccountDialog } from './DeleteAccountDialog';

export const DeleteAccountSection = (): JSX.Element => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <section>
      <hr />
      <h2>Account</h2>
      <p>
        Talrum keeps your data until you delete your account.{' '}
        <Link to="/privacy-policy">Read the privacy policy.</Link>
      </p>
      <button type="button" onClick={() => setOpen(true)}>
        Delete my account
      </button>
      {open && (
        <DeleteAccountDialog
          onCancel={() => setOpen(false)}
          onSuccess={() => navigate('/account-deleted', { replace: true })}
        />
      )}
    </section>
  );
};
```

- [ ] **Step 3: Run the section test**

Run: `npm run test -- src/features/settings/DeleteAccountSection.test.tsx`
Expected: all 3 tests PASS.

- [ ] **Step 4: Wire `DeleteAccountSection` into `SettingsRoute`**

Modify `src/features/settings/SettingsRoute.tsx`. Replace the `<ComingSoon ... />` line with:

```tsx
<>
  <ComingSoon body="Account preferences, voice settings, and PIN management. Coming in a future release." />
  <DeleteAccountSection />
</>
```

Add the import at the top:
```tsx
import { DeleteAccountSection } from './DeleteAccountSection';
```

- [ ] **Step 5: Update SettingsRoute test to assert presence of the deletion section**

Modify `src/features/settings/SettingsRoute.test.tsx`. Add a new test inside `describe('SettingsRoute', () => { ... })`:

```tsx
it('renders the Delete-my-account section', () => {
  renderRoute();
  expect(screen.getByRole('button', { name: /delete my account/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /privacy policy/i })).toBeInTheDocument();
});
```

You may also need to add a `vi.mock` for `@/lib/queries/account` at the top of the file, mirroring the pattern from `DeleteAccountSection.test.tsx`. Copy that mock if so.

- [ ] **Step 6: Run all tests**

Run: `npm run test`
Expected: all tests pass, including the SettingsRoute tests.

- [ ] **Step 7: Commit**

```bash
git add src/features/settings/DeleteAccountSection.tsx \
        src/features/settings/DeleteAccountSection.test.tsx \
        src/features/settings/SettingsRoute.tsx \
        src/features/settings/SettingsRoute.test.tsx
git commit -m "feat(ui): wire DeleteAccountSection into Settings (#100)

Settings page now hosts the deletion entry point. Section is
visually segregated (HR + 'Account' header) and navigates to
/account-deleted on success."
```

---

## Phase H — Privacy policy + runbook docs

### Task 16: Privacy policy markdown

**Files:**
- Modify: `docs/privacy-policy.md` (created as a placeholder in Task 12)

- [ ] **Step 1: Write the privacy policy draft**

Replace the contents of `docs/privacy-policy.md` with the full draft. Use the section list in the spec (`docs/superpowers/specs/2026-04-28-delete-my-account-design.md` § "Privacy policy") verbatim. Substitute `[TBD ...]` placeholders only where the spec explicitly notes a user-fill; leave the placeholders intact otherwise.

The file should contain at minimum:

```markdown
# Privacy Policy

**Effective date:** [TBD before launch]

## 1. Who we are
[Operator name + contact email — fill in before launch.]

## 2. What we collect
- **Account.** Email address and authentication metadata via Supabase.
- **Caregiver-created content.** Kid names, board names + structures,
  pictogram labels, custom pictogram images, voice recordings.
- **Technical.** Sign-in timestamps and (once issue #45 lands) error
  reports. We do not collect analytics tracking.

## 3. What we don't collect
We do not use third-party trackers, advertising IDs, location data,
or device fingerprinting.

## 4. Where it lives
Talrum data is stored on Supabase, which we use as a data processor.
Supabase region: [TBD — fill in based on the actual Supabase project
region]. Subject to Supabase's GDPR compliance posture.

## 5. Who has access
- The caregiver themselves, via JWT and row-level security.
- Board co-caregivers explicitly invited via the in-app sharing flow.
- The operator, for support purposes only; access is logged.

## 6. Retention
We keep your account data until you delete it. We may, in the
future, automatically delete accounts that have been inactive for
a period to be determined; if we do so, we will email you at least
30 days before deletion.

## 7. Deletion rights (GDPR Art. 17)
- **In-app:** Settings → Delete my account. Effective immediately
  and irreversibly.
- **By email:** [contact email]. We will respond within 30 days.

## 8. Operator-side restore
Supabase retains daily backups for [TBD days — based on plan]. If
you email us within that window, restore is *possible at our
discretion* but not promised. After the backup window expires,
deletion is final.

## 9. Data export (GDPR Art. 20)
Email [contact email]; we'll respond within 30 days.

## 10. Children's data
The caregiver is the data subject of record. The content describes
a child but the child is not the account holder. We treat this
content with the heightened sensitivity it warrants. Specific
jurisdictional treatment (COPPA in the US, equivalent EU
provisions) depends on the launch markets and is subject to legal
review.

## 11. Changes to this policy
We will notify users of material changes by email and via an
in-app notice.

## 12. Contact
[Operator contact email]
```

- [ ] **Step 2: Verify the route renders the markdown**

Run: `npm run dev`
Visit: `http://localhost:5173/privacy-policy`
Expected: the page renders with H1 "Privacy Policy" and all sections.

Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add docs/privacy-policy.md
git commit -m "docs: privacy-policy draft (#100)

Engineering draft. Awaits legal review per spec acceptance criteria.
Linked from in-app /privacy-policy route and the deletion modal.
[TBD] placeholders flagged for operator/lawyer fill-in."
```

---

### Task 17: Operator runbook for account deletion

**Files:**
- Create: `docs/runbooks/account-deletion.md`

- [ ] **Step 1: Write the runbook**

Create `docs/runbooks/account-deletion.md`:

```markdown
# Runbook: account deletion

Operator-facing procedures for handling account deletion, restore, and
export requests. The in-app deletion flow handles the common case; this
runbook covers operator interventions.

## Scenario 1: user emails "please delete my account"

1. **Verify identity.** Confirm the request comes from the email on the
   account (reply-from-same-address). If it doesn't, ask the user to
   email from the account address.
2. **Look up the account.** Via Supabase dashboard SQL editor:
   ```sql
   SELECT id, email, created_at
   FROM auth.users
   WHERE email = '<user@example.com>';
   ```
3. **Choose a path.**
   - **(a)** If the user can sign in: instruct them to use Settings →
     Delete my account. They get a confirmation, the action is logged
     server-side, and you don't have to touch anything.
   - **(b)** If they can't (lost password, broken account, etc.):
     execute server-side. Two methods:

     **Method b1 (preferred): invoke the edge function as the user.**
     - In the dashboard, send a magic link to the user's email.
     - Get the access token from the link (or paste the link contents).
     - Run:
       ```sh
       curl -X POST "$API_URL/functions/v1/delete-account" \
         -H "Authorization: Bearer $USER_JWT" \
         -H "Content-Type: application/json" \
         -d '{}'
       ```

     **Method b2: direct SQL + storage delete (fallback).**
     ```sql
     -- 1. List storage objects scoped to this user.
     SELECT name FROM storage.objects
     WHERE bucket_id IN ('pictogram-audio', 'pictogram-images')
       AND (storage.foldername(name))[1] = '<uid>';

     -- 2. Delete them.
     DELETE FROM storage.objects
     WHERE bucket_id IN ('pictogram-audio', 'pictogram-images')
       AND (storage.foldername(name))[1] = '<uid>';

     -- 3. Delete the auth row (cascades to public tables).
     DELETE FROM auth.users WHERE id = '<uid>';
     ```
4. **Confirm to the user.** Reply with: "Your account and all
   associated data have been deleted. This action is irreversible
   under our standard policy."
5. **Log the request.** Record the date, the user_id (now deleted),
   and the path chosen (a / b1 / b2) in [TBD: the operator's
   preferred ops log].

## Scenario 2: "I deleted my account by mistake, please restore"

This is rare and discretionary; the standard policy is "deletion is
final." Restore is only feasible while a Supabase backup containing
the user's data still exists.

1. **Check the backup retention window.** From the Supabase dashboard,
   note the backup retention period (depends on plan). If the
   deletion happened within that window, restore *may* be possible.
2. **Weigh the cost.** Restoring a Supabase project is a project-level
   operation, not per-user. Implications:
   - All other users' data is also rolled back.
   - All active sessions and recent activity since the backup point
     are lost.
3. **If you proceed:** follow Supabase's "Point-in-Time Recovery" or
   backup-restore procedure (per their dashboard docs). Coordinate
   with all active users — restoring loses recent work.
4. **If you decline:** reply apologetically that the deletion is
   final.

This is a decision-factors document, not a SLA. The standard answer
is "no, deletion is final per our privacy policy."

## Scenario 3: "please export my data" (GDPR Art. 20)

Until the in-app data export ships (separate follow-up issue):

1. **Pull data from each table:**
   ```sql
   COPY (SELECT * FROM public.kids       WHERE owner_id = '<uid>') TO STDOUT WITH CSV HEADER;
   COPY (SELECT * FROM public.pictograms WHERE owner_id = '<uid>') TO STDOUT WITH CSV HEADER;
   COPY (SELECT * FROM public.boards     WHERE owner_id = '<uid>') TO STDOUT WITH CSV HEADER;
   COPY (SELECT * FROM public.board_members WHERE user_id = '<uid>') TO STDOUT WITH CSV HEADER;
   ```
2. **Pull storage objects:**
   ```sh
   supabase storage download --recursive \
     pictogram-audio/<uid> \
     ./export-<uid>/audio/
   supabase storage download --recursive \
     pictogram-images/<uid> \
     ./export-<uid>/images/
   ```
3. **Bundle:** `zip -r export-<uid>.zip export-<uid>/`
4. **Send via email.** Include a note that the export is provided
   under GDPR Art. 20 and that the user can request deletion at any
   time.
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/account-deletion.md
git commit -m "docs(runbook): operator procedures for account deletion (#100)

Three scenarios: in-app flow + (a) self-serve / (b) operator-assisted
deletion; (b) restore-from-backup (decision factors); (c) manual data
export. Copy-paste-ready SQL + curl commands."
```

---

### Task 18: Deploy/secrets runbook

**Files:**
- Create: `docs/runbooks/deploy.md` (if it does not already exist; otherwise extend)

- [ ] **Step 1: Check for existing runbook**

Run: `ls docs/runbooks/`
If `deploy.md` exists: read it and extend with a new section. If not: create from scratch.

- [ ] **Step 2: Write or extend `docs/runbooks/deploy.md`**

If creating, use:

```markdown
# Runbook: deploys

## Required GitHub secrets

For the cloud project (and any future staging project), the following
GitHub Actions secrets must be set:

| Secret | Used by | Source |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | `deploy-migrations.yml`, `deploy-functions.yml` | Supabase dashboard → Account → Access Tokens |
| `SUPABASE_DB_PASSWORD` | `deploy-migrations.yml` | Supabase dashboard → Project settings → Database |
| `SUPABASE_PROJECT_REF` | `deploy-migrations.yml`, `deploy-functions.yml` | Supabase dashboard → Project settings → General |

Set them with: `gh secret set <NAME> --repo nbhansen/Talrum`

## Required edge-function secrets (one-time per project)

The `delete-account` function reads `SUPABASE_SERVICE_ROLE_KEY` from
`Deno.env`. Set it once per project:

```sh
supabase secrets set --project-ref <project-ref> \
  SUPABASE_SERVICE_ROLE_KEY=<value-from-dashboard>
```

The value lives at: Supabase dashboard → Project settings → API →
service_role key.

**This is a one-shot manual step.** It is not part of CI. If the
key is rotated (see "Rotation" below), this command must be re-run.

## Rotation: SUPABASE_SERVICE_ROLE_KEY

If the service-role key is rotated:

1. From the Supabase dashboard, copy the new value.
2. Re-run `supabase secrets set --project-ref <ref> SUPABASE_SERVICE_ROLE_KEY=<new>`.
3. The next function invocation will pick up the new value (functions
   are stateless; no redeploy needed).
4. Verify by triggering the integration test:
   `npm run test:e2e:delete-account` (against staging if available).

## Manual fallback

If `deploy-migrations.yml` is broken: `supabase db push --linked`
from a clean checkout.

If `deploy-functions.yml` is broken: `supabase functions deploy
delete-account --project-ref <ref>` (with `SUPABASE_ACCESS_TOKEN`
set in the local environment).
```

- [ ] **Step 3: Commit**

```bash
git add docs/runbooks/deploy.md
git commit -m "docs(runbook): document function secrets + rotation (#100)

Closes the gap from issue #95: required GH secrets, the one-time
SUPABASE_SERVICE_ROLE_KEY function-secret bootstrap, rotation
procedure, manual-fallback commands."
```

---

## Phase I — Deploy workflow

### Task 19: Add `deploy-functions.yml`

**Files:**
- Create: `.github/workflows/deploy-functions.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/deploy-functions.yml`:

```yaml
name: deploy-functions
on:
  push:
    branches: [main]
    paths:
      - 'supabase/functions/**'
      - '.github/workflows/deploy-functions.yml'
concurrency:
  group: deploy-functions
  cancel-in-progress: false
jobs:
  push:
    runs-on: ubuntu-latest
    env:
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      PROJECT_REF: ${{ secrets.SUPABASE_PROJECT_REF }}
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: supabase functions deploy delete-account --project-ref "$PROJECT_REF"
```

- [ ] **Step 2: Sanity-check the workflow file**

Run: `cat .github/workflows/deploy-functions.yml`
Verify the syntax is valid YAML (no obvious indentation errors).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-functions.yml
git commit -m "ci: deploy-functions workflow (#100)

Triggers on push to main for paths under supabase/functions/**.
First function deployed: delete-account. SUPABASE_SERVICE_ROLE_KEY
is set via supabase secrets, not as a workflow env var (see
docs/runbooks/deploy.md)."
```

---

## Phase J — Wrap-up: follow-ups + final verification

### Task 20: File the follow-up issues

**Files:** none (uses `gh issue create`)

- [ ] **Step 1: File the four follow-up issues per the spec**

Run each command (substitute the operator's email/preference where applicable):

```sh
gh issue create \
  --title "Inactivity-triggered account cleanup — implement at ~100 active users" \
  --body "Deferred from #100 (Q4 decision). When user count justifies it, build:
- pg_cron job scanning auth.users.last_sign_in_at
- 30-day warning email via [TBD: Resend / Postmark / etc]
- Reuse the deletion helper from supabase/functions/delete-account/deleteAccount.ts via a sibling cron-callable entry point.

Decision factors: ~100 active users; storage cost trending up; or a stated request from legal/ops.

Privacy policy already reserves the right with a 30-day-notice promise."

gh issue create \
  --title "In-app data export flow (GDPR Art. 20)" \
  --body "Manual via runbook today (docs/runbooks/account-deletion.md, scenario 3). Build an in-app Settings → Export my data button that:
- Bundles all owner-scoped rows (kids, pictograms, boards, board_members) as JSON or CSV.
- Bundles storage objects under <uid>/ in both buckets.
- Delivers via signed-URL download or email link.

Likely a sibling edge function to delete-account."

gh issue create \
  --title "Privacy policy lawyer review before public launch" \
  --body "Engineering draft committed at docs/privacy-policy.md (#100). Before launch:
- Counsel reviews wording.
- TBD placeholders filled (operator name + email, Supabase region, backup retention days).
- Section 10 (children's data) refined for the launch markets.

Process gate, not engineering work."

gh issue create \
  --title "Optional: fresh-OTP re-auth before account deletion" \
  --body "Q3 stronger tier deferred from #100. Add only if threat model evolves (e.g., reports of stolen-but-unlocked-iPad deletion incidents).

Implementation: add a JWT freshness check in supabase/functions/delete-account/index.ts (\`if (now - jwt.iat > 300) reject('reauth_required')\`), and a fresh-OTP flow in DeleteAccountDialog. Additive; current architecture is upgrade-ready."
```

- [ ] **Step 2: Verify all four issues are created**

Run: `gh issue list --state open --search "in:title 'inactivity-triggered' OR 'data export' OR 'lawyer review' OR 'fresh-OTP'"`
Expected: all four issues listed.

- [ ] **Step 3: No commit** (this task creates issues, not files).

---

### Task 21: Final acceptance check against the spec

**Files:** none (verification only)

- [ ] **Step 1: Run the full local verification battery**

```sh
npm run typecheck
npm run lint
npm run test
npm run test:db
npm run test:functions
# Then with `supabase functions serve delete-account` running in another tab:
npm run test:e2e:delete-account
```

Expected: all green.

- [ ] **Step 2: Walk through the acceptance criteria from the spec**

Open `docs/superpowers/specs/2026-04-28-delete-my-account-design.md` § "Acceptance criteria" and confirm each box can now be checked:

- [ ] Prerequisite migration ships; pgTAP verifies. (Tasks 1–2)
- [ ] Edge function exists, deploys via `deploy-functions.yml`, passes Surface 1 + 2 unit tests. (Tasks 3–7, 19)
- [ ] E2E integration test passes locally and in CI. (Tasks 8–9)
- [ ] `SettingsRoute` extended with `DeleteAccountSection` + `DeleteAccountDialog`; UI tests pass. (Tasks 13–15)
- [ ] `/account-deleted` route exists, ungated by AuthGate; routing test verifies. (Task 12)
- [ ] `useDeleteMyAccount` mutation handles all closed-set error codes; clears cache + signs out on success only. (Tasks 10–11)
- [ ] `docs/privacy-policy.md` draft committed. (Task 16)
- [ ] In-app `/privacy-policy` route renders the markdown. (Task 12, 16)
- [ ] `docs/runbooks/account-deletion.md` covers the three scenarios. (Task 17)
- [ ] CI gates pass. (Task 9)
- [ ] Follow-up issues filed. (Task 20)

If anything is unchecked, address it before opening the PR.

- [ ] **Step 3: Open the pull request**

```sh
git push origin <branch>
gh pr create \
  --title "Delete-my-account flow + retention/privacy (#100)" \
  --body "$(cat <<'EOF'
## Summary
- Adds the in-app delete-my-account flow per spec docs/superpowers/specs/2026-04-28-delete-my-account-design.md.
- Prerequisite migration: FK cascades from app tables to auth.users.
- New edge function: supabase/functions/delete-account (first edge function in the project).
- Privacy policy draft + operator runbook.
- Closes #100.

## Test plan
- [x] npm run typecheck / lint / test
- [x] supabase test db (incl. new owner_fk_cascades_test.sql)
- [x] npm run test:functions (Deno unit tests)
- [x] npm run test:e2e:delete-account (integration test)
- [x] Manual smoke: sign up → settings → delete → verify /account-deleted, sign-in fails

## Follow-ups filed
- Inactivity-triggered cleanup (Q4 deferral)
- In-app data export (GDPR Art. 20)
- Privacy policy lawyer review (process gate)
- Optional fresh-OTP re-auth (Q3 stronger tier)
EOF
)"
```

- [ ] **Step 4: Done.**

---

## Self-review (before handoff to executing agent)

**Spec coverage:**
- FK cascade prerequisite — Tasks 1, 2.
- Edge function (pure logic, handler, contracts, observability) — Tasks 3–7.
- E2E integration test — Tasks 8, 9.
- Client mutation + closed-set error mapping — Tasks 10, 11.
- Settings UI + dialog + new routes — Tasks 12–15.
- Privacy policy + in-app rendering — Tasks 12, 16.
- Operator runbook — Task 17.
- Function-secrets / rotation runbook — Task 18.
- Deploy workflow — Task 19.
- Follow-up issues + acceptance check — Tasks 20, 21.

All spec acceptance criteria map to a task.

**Open spec questions resolved at plan-time:**
- Markdown rendering: `react-markdown` + Vite `?raw` import (Task 12). Single source of truth in `docs/privacy-policy.md`.
- Function deploy auth: `SUPABASE_ACCESS_TOKEN` only (matches existing `deploy-migrations.yml`).
- pgTAP behavioral cascade test: included as Task 2.
- Service-role key rotation: documented in Task 18.

**Out-of-scope-bug policy** (per spec): if implementation surfaces a pre-existing unrelated bug, file via `gh issue create` and continue. Do not bundle.
