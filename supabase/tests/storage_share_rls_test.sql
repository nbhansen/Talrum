-- Regression test for storage RLS shared-board access (issue #37).
--
-- Four users:
--   Alice   — owns the board + storage we're sharing.
--   Bob     — viewer on one of Alice's boards. Should see her storage.
--   Charlie — no membership anywhere. Should see nothing.
--   Dana    — viewer on one of Charlie's boards but NOT Alice's. Catches
--             a regression where the predicate loosens from "member of
--             this owner" to "member anywhere".
--
-- The test exercises the actual policies under role-switched sessions
-- and asserts:
--
--   helper layer  — `is_pictogram_storage_visible(path)` returns
--                   true for the owner, true for a member, false for
--                   a stranger or a cross-owner member.
--   policy layer  — SELECT through `pictogram_audio_select` and
--                   `pictogram_images_select` returns 1/1/0/0 rows
--                   for owner/member/non-member/cross-owner-member.
--   write floor   — a member cannot UPDATE or INSERT into the owner's
--                   prefix; the existing owner-only write policies
--                   still gate writes. (DELETE on storage.objects is
--                   blocked by a supabase `protect_delete` trigger
--                   that fires before RLS, so DELETE isn't testable
--                   from SQL — the storage API enforces it.)
--
-- The "member sees 1 row" assertions are the specific guards against
-- the shadowing bug fixed in 20260425020000. Any future regression
-- that re-breaks the member branch (column shadow, missing helper,
-- bad cast) will land on these.
--
-- Run with: supabase test db
BEGIN;
SELECT plan(17);

-- Four users. handle_new_user() seeds a starter library for each on
-- INSERT, so Alice and Charlie each end up owning a few boards.
INSERT INTO auth.users (id, email)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice@test.local'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob@test.local'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'charlie@test.local'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dana@test.local');

-- Bob is a viewer on Alice's first seeded board.
INSERT INTO public.board_members (board_id, user_id, role)
SELECT id, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'viewer'
  FROM public.boards
 WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
 ORDER BY id LIMIT 1;

-- Dana is a viewer on Charlie's first seeded board (NOT Alice's). She
-- is a member-somewhere but not of Alice's data.
INSERT INTO public.board_members (board_id, user_id, role)
SELECT id, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'viewer'
  FROM public.boards
 WHERE owner_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
 ORDER BY id LIMIT 1;

-- Precondition pinning: confirm both viewer rows actually got inserted.
-- If a future migration adds a constraint that prevents these inserts,
-- the rest of the test would silently pass against an empty fixture.
SELECT is(
  (SELECT count(*)::int FROM public.board_members
    WHERE user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  1,
  'fixture: bob is a viewer on exactly one board (alice''s)'
);
SELECT is(
  (SELECT count(*)::int FROM public.board_members
    WHERE user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  1,
  'fixture: dana is a viewer on exactly one board (charlie''s, not alice''s)'
);

-- One fake storage object per bucket under Alice's prefix.
-- Path shape matches what the client uploader writes.
INSERT INTO storage.objects (bucket_id, name, owner) VALUES
  ('pictogram-audio',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wakeup.webm',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid),
  ('pictogram-images',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wakeup.jpg',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid);

-- ── 1. Helper exists with the right shape ──────────────────────────────────

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'is_pictogram_storage_visible'
       AND p.prosecdef = true
  ),
  'is_pictogram_storage_visible exists in public schema as SECURITY DEFINER'
);

-- ── 2-4. Helper logic, three roles ─────────────────────────────────────────
-- SET LOCAL applies for the rest of the transaction; subsequent SET LOCALs
-- replace previous values. ROLLBACK at the end discards everything.

SET LOCAL ROLE authenticated;

SET LOCAL "request.jwt.claims" TO
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
SELECT ok(
  is_pictogram_storage_visible('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wakeup.webm'),
  'helper: owner sees own audio path'
);

SET LOCAL "request.jwt.claims" TO
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';
SELECT ok(
  is_pictogram_storage_visible('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wakeup.webm'),
  'helper: board member sees owner audio path (#37 regression guard)'
);

SET LOCAL "request.jwt.claims" TO
  '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}';
SELECT ok(
  NOT is_pictogram_storage_visible('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wakeup.webm'),
  'helper: non-member does not see owner audio path'
);

-- Dana is a member of CHARLIE's board, not Alice's. She must not see
-- Alice's storage. Catches a regression where the predicate loosens
-- from "scoped to this owner's boards" to "any membership anywhere".
SET LOCAL "request.jwt.claims" TO
  '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}';
SELECT ok(
  NOT is_pictogram_storage_visible('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wakeup.webm'),
  'helper: cross-owner member (dana) does not see alice audio path'
);

-- ── Policy through SELECT, four roles, audio ───────────────────────────────

SET LOCAL "request.jwt.claims" TO
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM storage.objects
    WHERE bucket_id = 'pictogram-audio'
      AND name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wakeup.webm'),
  1,
  'policy: owner SELECT returns 1 audio row'
);

SET LOCAL "request.jwt.claims" TO
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM storage.objects
    WHERE bucket_id = 'pictogram-audio'
      AND name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wakeup.webm'),
  1,
  'policy: board member SELECT returns 1 audio row (#37 regression guard)'
);

SET LOCAL "request.jwt.claims" TO
  '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM storage.objects
    WHERE bucket_id = 'pictogram-audio'
      AND name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wakeup.webm'),
  0,
  'policy: non-member SELECT returns 0 audio rows'
);

SET LOCAL "request.jwt.claims" TO
  '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM storage.objects
    WHERE bucket_id = 'pictogram-audio'
      AND name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wakeup.webm'),
  0,
  'policy: cross-owner member SELECT returns 0 audio rows (scoped-membership guard)'
);

-- ── Policy through SELECT, four roles, images ──────────────────────────────

SET LOCAL "request.jwt.claims" TO
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM storage.objects
    WHERE bucket_id = 'pictogram-images'
      AND name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wakeup.jpg'),
  1,
  'policy: owner SELECT returns 1 image row'
);

SET LOCAL "request.jwt.claims" TO
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM storage.objects
    WHERE bucket_id = 'pictogram-images'
      AND name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wakeup.jpg'),
  1,
  'policy: board member SELECT returns 1 image row'
);

SET LOCAL "request.jwt.claims" TO
  '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM storage.objects
    WHERE bucket_id = 'pictogram-images'
      AND name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wakeup.jpg'),
  0,
  'policy: non-member SELECT returns 0 image rows'
);

SET LOCAL "request.jwt.claims" TO
  '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM storage.objects
    WHERE bucket_id = 'pictogram-images'
      AND name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wakeup.jpg'),
  0,
  'policy: cross-owner member SELECT returns 0 image rows (scoped-membership guard)'
);

-- ── Member cannot write to owner's prefix ──────────────────────────────────
-- The widened SELECT must not have widened writes. UPDATE is RLS-filtered
-- to 0 rows by the existing owner-only UPDATE policy; INSERT is rejected
-- outright by the existing path-prefix-gated INSERT policy.

SET LOCAL "request.jwt.claims" TO
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';

WITH upd AS (
  UPDATE storage.objects SET name = name
   WHERE bucket_id = 'pictogram-audio'
     AND name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wakeup.webm'
   RETURNING 1
)
SELECT is(
  (SELECT count(*)::int FROM upd),
  0,
  'policy: member cannot UPDATE owner audio (RLS-filtered)'
);

SELECT throws_ok(
  $$ INSERT INTO storage.objects (bucket_id, name, owner)
     VALUES ('pictogram-audio',
             'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bob-tried.webm',
             'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid) $$,
  '42501',
  NULL,
  'policy: member cannot INSERT into owner prefix'
);

SELECT * FROM finish();
ROLLBACK;
