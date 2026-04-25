-- Regression test for handle_new_user() — the SECURITY DEFINER trigger that
-- seeds a starter library on each auth.users insert. Verifies per-user
-- counts, owner isolation, step_id remap correctness, and idempotency on
-- re-fire.
--
-- Run with: supabase test db
BEGIN;
SELECT plan(14);

-- Capture template counts so the assertions below survive future seed
-- changes (add more pictograms, add a fifth board, etc.) without editing
-- magic numbers.
\set ON_ERROR_STOP on
CREATE TEMP TABLE tt AS
  SELECT
    (SELECT count(*)::int FROM public.template_pictograms) AS pictos,
    (SELECT count(*)::int FROM public.template_boards)     AS boards;

-- Floor checks: if template_* were ever truncated (or RLS hid them from
-- this session), every subsequent count assertion would pass vacuously
-- as 0==0. Pin a known-minimum to make that failure mode loud.
SELECT cmp_ok(
  (SELECT pictos FROM tt), '>=', 17,
  'template_pictograms is populated (>=17)'
);
SELECT cmp_ok(
  (SELECT boards FROM tt), '>=', 4,
  'template_boards is populated (>=4)'
);

-- Two ephemeral users. is_sso_user / is_anonymous have defaults; only id
-- is required. Trigger fires AFTER INSERT.
INSERT INTO auth.users (id, email)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

-- 1–2: each user gets exactly one kid named "Liam".
SELECT is(
  (SELECT count(*)::int FROM public.kids WHERE owner_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'user A has exactly one kid'
);
SELECT is(
  (SELECT name FROM public.kids WHERE owner_id = '22222222-2222-2222-2222-222222222222'),
  'Liam',
  'user B kid is named Liam'
);

-- 3–4: pictogram counts match the template library, per-user.
SELECT is(
  (SELECT count(*)::int FROM public.pictograms WHERE owner_id = '11111111-1111-1111-1111-111111111111'),
  (SELECT pictos FROM tt),
  'user A pictogram count matches template_pictograms'
);
SELECT is(
  (SELECT count(*)::int FROM public.pictograms WHERE owner_id = '22222222-2222-2222-2222-222222222222'),
  (SELECT pictos FROM tt),
  'user B pictogram count matches template_pictograms'
);

-- 5–6: board counts match the template library, per-user.
SELECT is(
  (SELECT count(*)::int FROM public.boards WHERE owner_id = '11111111-1111-1111-1111-111111111111'),
  (SELECT boards FROM tt),
  'user A board count matches template_boards'
);
SELECT is(
  (SELECT count(*)::int FROM public.boards WHERE owner_id = '22222222-2222-2222-2222-222222222222'),
  (SELECT boards FROM tt),
  'user B board count matches template_boards'
);

-- 7: pictogram ids are disjoint between users (no row reuse, no shared PKs).
SELECT is(
  (SELECT count(*)::int FROM public.pictograms a
     JOIN public.pictograms b ON a.id = b.id
    WHERE a.owner_id = '11111111-1111-1111-1111-111111111111'
      AND b.owner_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'pictogram ids do not overlap across users'
);

-- 8: every step_id in user A's boards points at one of user A's pictograms.
-- Catches the slug→uuid remap regressing into a global lookup.
SELECT is(
  (SELECT count(*)::int FROM (
     SELECT unnest(step_ids) AS sid
       FROM public.boards
      WHERE owner_id = '11111111-1111-1111-1111-111111111111'
   ) s
   WHERE s.sid NOT IN (
     SELECT id FROM public.pictograms WHERE owner_id = '11111111-1111-1111-1111-111111111111'
   )),
  0,
  'user A board step_ids all resolve within user A pictograms'
);

-- 9: user A's step_ids never reference user B's pictograms.
SELECT is(
  (SELECT count(*)::int FROM (
     SELECT unnest(step_ids) AS sid
       FROM public.boards
      WHERE owner_id = '11111111-1111-1111-1111-111111111111'
   ) s
   WHERE s.sid IN (
     SELECT id FROM public.pictograms WHERE owner_id = '22222222-2222-2222-2222-222222222222'
   )),
  0,
  'user A board step_ids never point at user B pictograms'
);

-- 10: symmetric — user B's step_ids never reference user A's pictograms.
SELECT is(
  (SELECT count(*)::int FROM (
     SELECT unnest(step_ids) AS sid
       FROM public.boards
      WHERE owner_id = '22222222-2222-2222-2222-222222222222'
   ) s
   WHERE s.sid IN (
     SELECT id FROM public.pictograms WHERE owner_id = '11111111-1111-1111-1111-111111111111'
   )),
  0,
  'user B board step_ids never point at user A pictograms'
);

-- 13–14: idempotency. Trigger function guards on existing kid for the
-- owner. Re-firing must not double-seed. We can't INSERT the same auth.users
-- id twice (PK collision), so we attach handle_new_user to AFTER UPDATE for
-- the duration of the test, fire it via a no-op UPDATE, then drop it.
-- Note: this validates the function body's existing-kid guard, not the
-- AFTER INSERT wiring on auth.users. A regression that left the guard
-- intact but altered the INSERT-time conflict handling would not be
-- caught here; that's covered (implicitly) by the PK collision on
-- re-inserting auth.users.
CREATE TRIGGER tmp_retest
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
UPDATE auth.users SET email = email
 WHERE id = '11111111-1111-1111-1111-111111111111';
DROP TRIGGER tmp_retest ON auth.users;

SELECT is(
  (SELECT count(*)::int FROM public.kids WHERE owner_id = '11111111-1111-1111-1111-111111111111'),
  1,
  're-fire is a no-op: still exactly one kid for user A'
);
SELECT is(
  (SELECT count(*)::int FROM public.pictograms WHERE owner_id = '11111111-1111-1111-1111-111111111111'),
  (SELECT pictos FROM tt),
  're-fire is a no-op: pictogram count unchanged for user A'
);

SELECT * FROM finish();
ROLLBACK;
