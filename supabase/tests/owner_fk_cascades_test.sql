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
