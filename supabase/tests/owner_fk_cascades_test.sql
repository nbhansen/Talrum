-- Pins the FK-cascade contract for account deletion (#100): weakening a
-- cascade would only surface when a deletion fails to clean up.
-- Run with: supabase test db
BEGIN;
SELECT plan(3);

SELECT is(
  (SELECT count(*)::int FROM pg_constraint
    WHERE conname IN ('kids_owner_id_fkey', 'pictograms_owner_id_fkey',
                      'boards_owner_id_fkey', 'board_members_user_id_fkey')
      AND confdeltype = 'c'),
  4,
  'the four owner FKs exist and each is ON DELETE CASCADE'
);

-- Behavioral cascade: insert auth + app rows, delete auth, assert empty.
-- replica mode keeps handle_new_user() from auto-seeding the sentinel user,
-- so the cascade is asserted against known counts.
SET LOCAL session_replication_role = replica;

DO $$
DECLARE
  test_uid uuid := '00000000-0000-0000-0000-000000c45c4d';
BEGIN
  INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data,
                          aud, role, created_at, updated_at)
  VALUES (test_uid, 'cascade-test@example.com', '{}'::jsonb, '{}'::jsonb,
          'authenticated', 'authenticated', now(), now());

  INSERT INTO public.kids (owner_id, name) VALUES (test_uid, 'cascade-kid');
  INSERT INTO public.pictograms (owner_id, label, style, glyph, tint)
    VALUES (test_uid, 'apple', 'illus', 'apple', 'oklch(88% 0.05 20)');
  INSERT INTO public.boards (owner_id, kid_id, name, kind, voice_mode, accent)
  SELECT test_uid, k.id, 'cascade-board', 'sequence', 'tts', 'sage'
  FROM public.kids k WHERE k.owner_id = test_uid LIMIT 1;
  -- Exercises both cascade paths at once (user_id direct; board_id via
  -- boards). Either path removing the row satisfies the assertion.
  INSERT INTO public.board_members (board_id, user_id, role)
  SELECT b.id, test_uid, 'editor'
  FROM public.boards b WHERE b.owner_id = test_uid LIMIT 1;
END $$;

-- Re-enable triggers so the cascade FK actually fires on DELETE.
SET LOCAL session_replication_role = origin;

CREATE TEMP VIEW sentinel_counts AS
SELECT
  (SELECT count(*)::int FROM auth.users WHERE id = u.id) AS users,
  (SELECT count(*)::int FROM public.kids WHERE owner_id = u.id) AS kids,
  (SELECT count(*)::int FROM public.pictograms WHERE owner_id = u.id) AS pictograms,
  (SELECT count(*)::int FROM public.boards WHERE owner_id = u.id) AS boards,
  (SELECT count(*)::int FROM public.board_members WHERE user_id = u.id) AS board_members
FROM (VALUES ('00000000-0000-0000-0000-000000c45c4d'::uuid)) AS u(id);

SELECT results_eq(
  'SELECT * FROM sentinel_counts',
  $$ VALUES (1, 1, 1, 1, 1) $$,
  'pre-delete: 1 auth row, kid, pictogram, board and board_member for the sentinel uid'
);

DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-000000c45c4d'::uuid;

SELECT results_eq(
  'SELECT * FROM sentinel_counts',
  $$ VALUES (0, 0, 0, 0, 0) $$,
  'post-delete: the auth row is gone and each app row cascaded'
);

SELECT * FROM finish();
ROLLBACK;
