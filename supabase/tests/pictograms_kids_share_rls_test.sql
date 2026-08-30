-- pictograms / kids RLS on shared boards — the data-plane twin of
-- storage_share_rls_test.sql; the two layers must agree. Same four-user
-- shape. Kids stay owner-only for every non-owner: #490 widened pictogram
-- writes, not kid writes (#508). Run with: supabase test db
BEGIN;
SELECT plan(14);

INSERT INTO auth.users (id, email)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice@test.local'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob@test.local'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'charlie@test.local'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dana@test.local'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'erin@test.local');

-- Erin: editor on Alice's first board. Editors write the owner's library (#490).
INSERT INTO public.board_members (board_id, user_id, role)
SELECT id, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'editor'
  FROM public.boards
 WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
 ORDER BY id LIMIT 1;

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

-- Counts captured as postgres, before role switching, so the test never
-- hardcodes template numbers. The GRANT below is required: authenticated
-- has no default SELECT on temp tables.
CREATE TEMP TABLE expected AS
  SELECT
    (SELECT count(*)::int FROM public.pictograms
      WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') AS pictograms,
    (SELECT count(*)::int FROM public.kids
      WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') AS kids;
GRANT SELECT ON expected TO authenticated;

SET LOCAL ROLE authenticated;

-- ── 1-4. pictograms_select policy, four roles ──────────────────────────────

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

-- ── 5-7. kids_select policy ──────────────────────────────────────────────
-- Three of the four roles: same logic plane as pictograms, and the
-- owner+member case is the load-bearing one.

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

-- ── 8. Member cannot UPDATE owner pictograms ──────────────────────────────
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

-- ── 9-11. An editor writes the owner's library; a stranger does not (#490) ─

SET LOCAL "request.jwt.claims" TO
  '{"sub":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee","role":"authenticated"}';
WITH upd AS (
  UPDATE public.pictograms SET label = label
   WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
   RETURNING 1
)
SELECT is(
  (SELECT count(*)::int FROM upd),
  (SELECT pictograms FROM expected),
  'policy: editor CAN UPDATE owner pictograms'
);

WITH ins AS (
  INSERT INTO public.pictograms (owner_id, label, style)
  VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'by erin', 'photo')
  RETURNING 1
)
SELECT is(
  (SELECT count(*)::int FROM ins),
  1,
  'policy: editor CAN INSERT a pictogram into the owner library'
);

SELECT throws_ok(
  $$
    UPDATE public.pictograms
       SET owner_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
     WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  $$,
  '42501',
  'pictograms.owner_id cannot change',
  'policy: editor cannot move owner pictograms into their own library (trigger)'
);

SET LOCAL "request.jwt.claims" TO
  '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}';
SELECT throws_ok(
  $$
    INSERT INTO public.pictograms (owner_id, label, style)
    VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'by dana', 'photo')
  $$,
  '42501',
  'new row violates row-level security policy for table "pictograms"',
  'policy: cross-owner member cannot INSERT into the owner library'
);

-- ── 12-13. kids_owner_write negative path (#508) ──────────────────────────

SET LOCAL "request.jwt.claims" TO
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';
WITH upd AS (
  UPDATE public.kids SET name = name
   WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
   RETURNING 1
)
SELECT is(
  (SELECT count(*)::int FROM upd),
  0,
  'policy: member cannot UPDATE owner kids (RLS-filtered)'
);

SET LOCAL "request.jwt.claims" TO
  '{"sub":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee","role":"authenticated"}';
WITH upd AS (
  UPDATE public.kids SET name = name
   WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
   RETURNING 1
)
SELECT is(
  (SELECT count(*)::int FROM upd),
  0,
  'policy: editor cannot UPDATE owner kids (write widening stops at pictograms)'
);

SELECT * FROM finish();
ROLLBACK;
