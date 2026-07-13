-- Regression test for boards / board_members RLS.
--
-- boards carries the most policy surface of any table (per-command
-- select/insert/update/delete plus the membership and editor branches)
-- but until now was exercised only incidentally by
-- pictograms_kids_share_rls_test.sql and storage_share_rls_test.sql.
-- This test pins the role matrix directly:
--
--   boards         — owner sees all own boards; a member sees exactly the
--                    shared board (not the owner's other boards); a
--                    stranger and a cross-owner member see zero. Viewer
--                    UPDATE is filtered, editor UPDATE succeeds
--                    (`boards_update` editor branch, wired since Phase 3
--                    even though the UI only surfaces viewers), DELETE
--                    stays owner-only, and INSERT with someone else's
--                    owner_id is rejected outright.
--   board_members  — the owner manages membership (positive INSERT and
--                    DELETE paths); a member sees only their own row and
--                    can neither self-escalate to editor, invite others,
--                    nor remove rows.
--
-- Same user shape as the sibling share tests: Alice owner; Bob viewer on
-- one Alice board; Erin editor on the same board (added by Alice through
-- RLS as a positive write assertion); Charlie unrelated; Dana member of
-- Charlie's board, NOT Alice's (scoped-membership guard).
--
-- Run with: supabase test db
BEGIN;
SELECT plan(15);

INSERT INTO auth.users (id, email)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice@test.local'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob@test.local'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'charlie@test.local'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dana@test.local'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'erin@test.local');

-- Bob: viewer on Alice's first board. Dana: viewer on Charlie's first
-- board only. Erin gets her editor row later, inserted BY Alice through
-- RLS (test 2). Seeded as postgres, like the sibling tests.
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

-- Captured as postgres so the assertions don't hardcode the number of
-- seeded template boards. GRANT needed: authenticated doesn't get SELECT
-- on temp tables by default.
CREATE TEMP TABLE ctx AS
  SELECT
    (SELECT count(*)::int FROM public.boards
      WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') AS alice_boards,
    (SELECT id FROM public.boards
      WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      ORDER BY id LIMIT 1) AS shared_board;
GRANT SELECT ON ctx TO authenticated;

SET LOCAL ROLE authenticated;

-- ── 1. Owner sees all own boards ────────────────────────────────────────────

SET LOCAL "request.jwt.claims" TO
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.boards
    WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  (SELECT alice_boards FROM ctx),
  'boards: owner sees all own boards'
);

-- ── 2. Owner can add a member through RLS (board_members_write positive) ────

WITH ins AS (
  INSERT INTO public.board_members (board_id, user_id, role)
  SELECT shared_board, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'editor'
    FROM ctx
  RETURNING 1
)
SELECT is(
  (SELECT count(*)::int FROM ins),
  1,
  'board_members: owner can add an editor'
);

-- ── 3-5. boards_select visibility matrix ────────────────────────────────────

SET LOCAL "request.jwt.claims" TO
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.boards
    WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  1,
  'boards: member sees exactly the shared board, not the owner''s others'
);

SET LOCAL "request.jwt.claims" TO
  '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.boards
    WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  0,
  'boards: stranger sees zero of owner boards'
);

SET LOCAL "request.jwt.claims" TO
  '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.boards
    WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  0,
  'boards: cross-owner member sees zero of owner boards (scoped-membership guard)'
);

-- ── 6-7. boards_update: viewer filtered, editor allowed ─────────────────────

SET LOCAL "request.jwt.claims" TO
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';
WITH upd AS (
  UPDATE public.boards SET name = name
   WHERE id = (SELECT shared_board FROM ctx)
   RETURNING 1
)
SELECT is(
  (SELECT count(*)::int FROM upd),
  0,
  'boards: viewer cannot UPDATE the shared board (RLS-filtered)'
);

SET LOCAL "request.jwt.claims" TO
  '{"sub":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee","role":"authenticated"}';
WITH upd AS (
  UPDATE public.boards SET name = name
   WHERE id = (SELECT shared_board FROM ctx)
   RETURNING 1
)
SELECT is(
  (SELECT count(*)::int FROM upd),
  1,
  'boards: editor CAN UPDATE the shared board (boards_update editor branch)'
);

-- ── 8. boards_delete stays owner-only, even for editors ─────────────────────

WITH del AS (
  DELETE FROM public.boards
   WHERE id = (SELECT shared_board FROM ctx)
   RETURNING 1
)
SELECT is(
  (SELECT count(*)::int FROM del),
  0,
  'boards: editor cannot DELETE the shared board (owner-only)'
);

-- ── 9. boards_insert rejects rows claiming someone else''s owner_id ──────────
-- Bob can SELECT Alice's kid (member visibility), so the subquery resolves;
-- the WITH CHECK on boards_insert must still reject the row outright.

SET LOCAL "request.jwt.claims" TO
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';
SELECT throws_ok(
  $$
    INSERT INTO public.boards (owner_id, kid_id, name, kind, voice_mode, accent)
    SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', k.id, 'intruder', 'choice', 'tts', 'moss'
      FROM public.kids k
     WHERE k.owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     LIMIT 1
  $$,
  '42501',
  'new row violates row-level security policy for table "boards"',
  'boards: member cannot INSERT a board with the owner''s owner_id'
);

-- ── 10-11. board_members_select: owner sees roster, member sees own row ─────

SET LOCAL "request.jwt.claims" TO
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.board_members
    WHERE board_id = (SELECT shared_board FROM ctx)),
  2,
  'board_members: owner sees the full roster (viewer + editor)'
);

SET LOCAL "request.jwt.claims" TO
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.board_members
    WHERE board_id = (SELECT shared_board FROM ctx)),
  1,
  'board_members: member sees only their own membership row'
);

-- ── 12-14. Members cannot manage membership ─────────────────────────────────

WITH upd AS (
  UPDATE public.board_members SET role = 'editor'
   WHERE user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
   RETURNING 1
)
SELECT is(
  (SELECT count(*)::int FROM upd),
  0,
  'board_members: viewer cannot self-escalate to editor (RLS-filtered)'
);

SELECT throws_ok(
  $$
    INSERT INTO public.board_members (board_id, user_id, role)
    SELECT shared_board, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'viewer'
      FROM ctx
  $$,
  '42501',
  'new row violates row-level security policy for table "board_members"',
  'board_members: member cannot invite another user'
);

WITH del AS (
  DELETE FROM public.board_members
   WHERE board_id = (SELECT shared_board FROM ctx)
   RETURNING 1
)
SELECT is(
  (SELECT count(*)::int FROM del),
  0,
  'board_members: member cannot remove membership rows (RLS-filtered)'
);

-- ── 15. Owner can remove a member through RLS ───────────────────────────────

SET LOCAL "request.jwt.claims" TO
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
WITH del AS (
  DELETE FROM public.board_members
   WHERE board_id = (SELECT shared_board FROM ctx)
     AND user_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
   RETURNING 1
)
SELECT is(
  (SELECT count(*)::int FROM del),
  1,
  'board_members: owner can remove a member'
);

SELECT * FROM finish();
ROLLBACK;
