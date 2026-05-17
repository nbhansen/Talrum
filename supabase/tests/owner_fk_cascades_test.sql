-- Pins the FK-cascade contract introduced for issue #100 (delete-my-account).
-- Without this, a future migration could drop or weaken the cascade and the
-- regression would only surface when a deletion fails to clean up app rows.
--
-- Run with: supabase test db
BEGIN;
SELECT plan(17);

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

-- Behavioral cascade test: insert auth + app rows, delete auth, assert empty.
-- Uses a sentinel uuid to avoid colliding with any existing test fixtures.
-- Disable session_replication_role so handle_new_user() does not auto-seed
-- a 'Liam' kid + template pictograms for the sentinel auth row — we want to
-- assert the cascade against rows we explicitly inserted, with known counts.
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
    VALUES (test_uid, 'apple', 'illus', '🍎', 'red');
  INSERT INTO public.boards (owner_id, kid_id, name, kind, voice_mode, accent)
  SELECT test_uid, k.id, 'cascade-board', 'sequence', 'tts', 'sage'
  FROM public.kids k WHERE k.owner_id = test_uid LIMIT 1;
  -- board_members: this row exercises BOTH cascade paths simultaneously
  -- (board_members.user_id -> auth.users(id), and indirectly
  -- board_members.board_id -> boards(id) -> auth.users(id)). Either path
  -- removing it satisfies the assertion; future test could split into two
  -- sentinel users to disambiguate.
  INSERT INTO public.board_members (board_id, user_id, role)
  SELECT b.id, test_uid, 'owner'
  FROM public.boards b WHERE b.owner_id = test_uid LIMIT 1;
END $$;

-- Re-enable triggers so the cascade FK actually fires on DELETE.
SET LOCAL session_replication_role = origin;

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
SELECT is(
  (SELECT count(*)::int FROM public.boards WHERE owner_id = '00000000-0000-0000-0000-000000c45c4d'::uuid),
  1, 'pre-delete: 1 board for sentinel uid'
);
SELECT is(
  (SELECT count(*)::int FROM public.board_members WHERE user_id = '00000000-0000-0000-0000-000000c45c4d'::uuid),
  1, 'pre-delete: 1 board_member for sentinel uid'
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
SELECT is(
  (SELECT count(*)::int FROM public.boards WHERE owner_id = '00000000-0000-0000-0000-000000c45c4d'::uuid),
  0, 'post-delete: boards cascaded'
);
SELECT is(
  (SELECT count(*)::int FROM public.board_members WHERE user_id = '00000000-0000-0000-0000-000000c45c4d'::uuid),
  0, 'post-delete: board_members cascaded'
);

SELECT * FROM finish();
ROLLBACK;
