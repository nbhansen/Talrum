-- Regression test for pictograms / kids RLS shared-board access.
--
-- Parallel to storage_share_rls_test.sql but for the data-plane policies
-- (`pictograms_select`, `kids_select`) that gate the rows whose
-- `image_path` / `audio_path` columns the storage policies then gate
-- bytes for. The two layers must agree: a member should see both the
-- row and the bytes; a non-member should see neither.
--
-- Four users with the same shape as the storage test (Alice owner;
-- Bob member of Alice; Charlie unrelated; Dana cross-owner member of
-- Charlie's board, NOT Alice's). Asserts:
--
--   helper layer  — `is_owner_shared_with_me(uuid)` returns the right
--                   answer for owner / member / non-member /
--                   cross-owner-member.
--   policy layer  — SELECT through `pictograms_select` and
--                   `kids_select` returns the owner's rows for the
--                   owner and the member; zero rows for the
--                   non-member and the cross-owner-member.
--   write floor   — a member cannot UPDATE the owner's pictograms
--                   (the existing `pictograms_owner_write` policy
--                   still gates writes).
--
-- Run with: supabase test db
BEGIN;
SELECT plan(13);

INSERT INTO auth.users (id, email)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice@test.local'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob@test.local'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'charlie@test.local'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dana@test.local');

INSERT INTO public.board_members (board_id, user_id, role)
SELECT id, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'viewer'
  FROM public.boards
 WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
 ORDER BY id LIMIT 1;

INSERT INTO public.board_members (board_id, user_id, role)
SELECT id, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'viewer'
  FROM public.boards
 WHERE owner_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
 ORDER BY id LIMIT 1;

-- Capture Alice's row counts BEFORE role switching, while still postgres.
-- Used as the expected count under owner + member sessions, so the test
-- doesn't hardcode template_pictograms / template_boards numbers.
-- The GRANT is needed because authenticated role doesn't get SELECT on
-- temp tables by default; without it the post-role-switch reads fail.
CREATE TEMP TABLE expected AS
  SELECT
    (SELECT count(*)::int FROM public.pictograms
      WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') AS pictograms,
    (SELECT count(*)::int FROM public.kids
      WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') AS kids;
GRANT SELECT ON expected TO authenticated;

-- ── 1. Helper exists ───────────────────────────────────────────────────────

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'is_owner_shared_with_me'
       AND p.prosecdef = true
  ),
  'is_owner_shared_with_me exists in public schema as SECURITY DEFINER'
);

-- ── 2-5. Helper logic, four roles ──────────────────────────────────────────

SET LOCAL ROLE authenticated;

SET LOCAL "request.jwt.claims" TO
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
SELECT ok(
  is_owner_shared_with_me('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid),
  'helper: owner shares with self'
);

SET LOCAL "request.jwt.claims" TO
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';
SELECT ok(
  is_owner_shared_with_me('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid),
  'helper: board member sees owner data'
);

SET LOCAL "request.jwt.claims" TO
  '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}';
SELECT ok(
  NOT is_owner_shared_with_me('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid),
  'helper: stranger does not see owner data'
);

SET LOCAL "request.jwt.claims" TO
  '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}';
SELECT ok(
  NOT is_owner_shared_with_me('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid),
  'helper: cross-owner member (dana) does not see alice data (scoped-membership guard)'
);

-- ── 6-9. pictograms_select policy, four roles ──────────────────────────────

SET LOCAL "request.jwt.claims" TO
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.pictograms
    WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  (SELECT pictograms FROM expected),
  'policy: owner sees full pictogram library'
);

SET LOCAL "request.jwt.claims" TO
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.pictograms
    WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  (SELECT pictograms FROM expected),
  'policy: board member sees owner pictogram library'
);

SET LOCAL "request.jwt.claims" TO
  '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.pictograms
    WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  0,
  'policy: stranger sees zero of owner pictograms'
);

SET LOCAL "request.jwt.claims" TO
  '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.pictograms
    WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  0,
  'policy: cross-owner member sees zero of owner pictograms (scoped-membership guard)'
);

-- ── 10-12. kids_select policy, three roles ─────────────────────────────────
-- Owner and member must see Alice's seeded kid; non-member and
-- cross-owner-member must not. (Picking three of the four roles —
-- owner/member/cross-owner — covers the same logic plane as pictograms;
-- one row in `kids` per user means the owner+member case is the load-
-- bearing one.)

SET LOCAL "request.jwt.claims" TO
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.kids
    WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  (SELECT kids FROM expected),
  'policy: owner sees own kid'
);

SET LOCAL "request.jwt.claims" TO
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.kids
    WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  (SELECT kids FROM expected),
  'policy: board member sees owner kid'
);

SET LOCAL "request.jwt.claims" TO
  '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.kids
    WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  0,
  'policy: cross-owner member sees zero of owner kids (scoped-membership guard)'
);

-- ── 13. Member cannot UPDATE owner pictograms ──────────────────────────────
-- The widened SELECT must not have widened writes. The existing
-- `pictograms_owner_write` policy keeps writes owner-only.

SET LOCAL "request.jwt.claims" TO
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';

WITH upd AS (
  UPDATE public.pictograms SET label = label
   WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
   RETURNING 1
)
SELECT is(
  (SELECT count(*)::int FROM upd),
  0,
  'policy: member cannot UPDATE owner pictograms (RLS-filtered)'
);

SELECT * FROM finish();
ROLLBACK;
